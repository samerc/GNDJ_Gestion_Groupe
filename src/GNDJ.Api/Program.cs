using System.IO.Compression;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.FileProviders.Physical;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using FluentValidation;
using GNDJ.Api.Authorization;
using GNDJ.Api.Middleware;
using GNDJ.Application.Common.Behaviors;
using GNDJ.Infrastructure;
using GNDJ.Infrastructure.Persistence;
using GNDJ.Infrastructure.Persistence.Interceptors;
using GNDJ.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using Serilog;
using Serilog.Events;
using Serilog.Sinks.PostgreSQL;
using NpgsqlTypes;

// Serilog bootstrap (file only — no console)
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
    .WriteTo.File("logs/gndj-.log", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30,
        outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
    .CreateBootstrapLogger();

var builder = WebApplication.CreateBuilder(args);

// Replace default logging with Serilog
builder.Host.UseSerilog((context, services, configuration) =>
{
    var connStr = context.Configuration.GetConnectionString("DefaultConnection");

    var columnWriters = new Dictionary<string, ColumnWriterBase>
    {
        ["message"] = new RenderedMessageColumnWriter(),
        ["message_template"] = new MessageTemplateColumnWriter(),
        ["level"] = new LevelColumnWriter(true, NpgsqlDbType.Varchar),
        ["timestamp"] = new TimestampColumnWriter(),
        ["exception"] = new ExceptionColumnWriter(),
        ["log_event"] = new LogEventSerializedColumnWriter(),
        ["properties"] = new PropertiesColumnWriter(),
    };

    configuration
        .MinimumLevel.Information()
        .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
        .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Application", "GNDJ")
        // Async sinks: logging is handed to a background thread via an in-memory buffer, so a slow/full
        // disk or a momentarily unavailable Postgres can't block the request thread that emitted the log.
        .WriteTo.Async(a => a.File("logs/gndj-.log", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30,
            outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}"))
        .WriteTo.Async(a => a.PostgreSQL(connStr!, "application_logs", columnWriters,
            needAutoCreateTable: true, restrictedToMinimumLevel: LogEventLevel.Warning));
});

// Persist DataProtection keys to disk so they survive app restarts / pool recycles (default is an
// ephemeral in-memory keyring — the "may be persisted unencrypted / ephemeral key repository" prod-log
// warnings). Keys live under the content root; the deploy preserves this folder (robocopy has no /MIR and
// excludes it via /XD), so they persist across deployments too.
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "dataprotection-keys")))
    .SetApplicationName("GNDJ");

// HSTS max-age = 1 year (ASP.NET Core's default UseHsts() is only 30 days, which scanners flag as weak).
// IncludeSubDomains/preload left off deliberately — other *.gndj.org hosts may not all be HTTPS yet.
builder.Services.AddHsts(options => options.MaxAge = TimeSpan.FromDays(365));

// Infrastructure (EF Core, repositories, JWT auth, services)
builder.Services.AddHttpContextAccessor();
// Singleton (not scoped): consumed by the singleton EF interceptors used with the pooled DbContext.
// It is stateless — it reads the current request's user lazily from the singleton IHttpContextAccessor.
builder.Services.AddSingleton<ICurrentUserAccessor, HttpContextCurrentUserAccessor>();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHostedService<GNDJ.Api.Services.OutboxSenderBackgroundService>();
builder.Services.AddHostedService<GNDJ.Api.Services.MemberPurgeBackgroundService>();
builder.Services.AddHostedService<GNDJ.Api.Services.DocumentCampaignBackgroundService>();
builder.Services.AddHostedService<GNDJ.Api.Services.RentreeReminderBackgroundService>();

// Performance: Response compression (gzip + brotli)
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/json", "text/plain"]);
});
builder.Services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);

// Performance: Output caching for read-heavy endpoints
builder.Services.AddOutputCache(options =>
{
    options.AddBasePolicy(p => p.NoCache());
    options.AddPolicy("LookupData", p => p.Expire(TimeSpan.FromMinutes(10)).Tag("lookup"));
    options.AddPolicy("ShortCache", p => p.Expire(TimeSpan.FromMinutes(2)).Tag("short"));
});

// Performance: Memory cache for general use
builder.Services.AddMemoryCache();

// Readiness + warm-up endpoint (anonymous) — used by the IIS Application Initialization warm-up probe so the
// app is hot before the first real user, and by uptime monitoring. The DatabaseHealthCheck does a cheap
// `SELECT 1`, which (a) reports Unhealthy if Postgres is down and (b) crucially WARMS the Npgsql/EF data path
// so an AppInit probe after a recycle primes the DB before the first authenticated request — killing the
// post-recycle cold window. (See GNDJ.Api.Health.DatabaseHealthCheck.)
builder.Services.AddHealthChecks()
    .AddCheck<GNDJ.Api.Health.DatabaseHealthCheck>("database");

// MediatR + FluentValidation
builder.Services.AddMediator(options => options.ServiceLifetime = ServiceLifetime.Scoped);
builder.Services.AddValidatorsFromAssemblyContaining<GNDJ.Application.AssemblyMarker>(ServiceLifetime.Scoped);
builder.Services.AddScoped(typeof(Mediator.IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

// Authorization
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();

// Controllers + OpenAPI
builder.Services.AddControllers();
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        document.Info = new()
        {
            Title = "GNDJ Scout API",
            Version = "v1",
            Description = "API pour la gestion du groupe scout GNDJ. Supporte l'authentification JWT (pour l'app interne) et les clés API (pour les intégrations externes)."
        };
        return Task.CompletedTask;
    });

    // Security schemes (JWT + API Key)
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        document.Components ??= new Microsoft.OpenApi.OpenApiComponents();
        document.Components.SecuritySchemes = new Dictionary<string, Microsoft.OpenApi.IOpenApiSecurityScheme>
        {
            ["Bearer"] = new Microsoft.OpenApi.OpenApiSecurityScheme
            {
                Type = Microsoft.OpenApi.SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = Microsoft.OpenApi.ParameterLocation.Header,
                Description = "Entrez votre token JWT. Exemple : eyJhbGci..."
            },
            ["ApiKey"] = new Microsoft.OpenApi.OpenApiSecurityScheme
            {
                Type = Microsoft.OpenApi.SecuritySchemeType.ApiKey,
                Name = "X-API-Key",
                In = Microsoft.OpenApi.ParameterLocation.Header,
                Description = "Entrez votre clé API. Exemple : gndj_abc12345..."
            }
        };

        // Apply security requirements to all operations
        if (document.Paths != null)
        {
            foreach (var operation in document.Paths.Values.SelectMany(path => path.Operations ?? []))
            {
                operation.Value.Security ??= [];
                operation.Value.Security.Add(new Microsoft.OpenApi.OpenApiSecurityRequirement
                {
                    [new Microsoft.OpenApi.OpenApiSecuritySchemeReference("Bearer", document)] = [],
                    [new Microsoft.OpenApi.OpenApiSecuritySchemeReference("ApiKey", document)] = []
                });
            }
        }

        return Task.CompletedTask;
    });

    // Document the common error responses on every operation, derived from its metadata — so we don't
    // have to scatter [ProducesResponseType] across ~150 endpoints. A body-bound write can return 400
    // (FluentValidation), an authenticated endpoint 401, and a permission-gated one 403. Per-action XML
    // <summary>/<response> comments still provide the human descriptions on top of this.
    options.AddOperationTransformer((operation, context, _) =>
    {
        var metadata = context.Description.ActionDescriptor.EndpointMetadata;
        var isAnonymous = metadata.OfType<Microsoft.AspNetCore.Authorization.IAllowAnonymous>().Any();
        var authorizeData = metadata.OfType<Microsoft.AspNetCore.Authorization.IAuthorizeData>().ToList();
        var requiresAuth = !isAnonymous && authorizeData.Count > 0;
        var requiresPermission = requiresAuth && authorizeData.Any(a => a.Policy is not null && a.Policy.StartsWith("Permission:"));
        var hasBody = context.Description.ParameterDescriptions.Any(p => p.Source == Microsoft.AspNetCore.Mvc.ModelBinding.BindingSource.Body);

        operation.Responses ??= new Microsoft.OpenApi.OpenApiResponses();
        void EnsureResponse(string code, string description)
        {
            if (!operation.Responses.ContainsKey(code))
                operation.Responses[code] = new Microsoft.OpenApi.OpenApiResponse { Description = description };
        }

        if (hasBody) EnsureResponse("400", "Requête invalide (échec de validation).");
        if (requiresAuth) EnsureResponse("401", "Authentification requise ou jeton invalide / expiré.");
        if (requiresPermission) EnsureResponse("403", "Permission insuffisante pour cette action.");
        return Task.CompletedTask;
    });
});

// CORS for React dev server
builder.Services.AddCors(options =>
{
    options.AddPolicy("Development", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Rate limiting — PARTITIONED BY CLIENT IP (not global) so that many users behind
// different connections can authenticate concurrently. A global limiter would cap the
// entire system (e.g. start-of-year registration with 100+ simultaneous logins).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;

    static string ClientKey(HttpContext ctx) =>
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    // Auth: brute-force protection per IP. Generous enough for a shared scout-meeting
    // network (many devices behind one NAT IP) while still throttling password guessing.
    options.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));

    // Upload: per IP.
    options.AddPolicy("upload", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromMinutes(10),
            QueueLimit = 0,
        }));

    // Forms: anti-abuse throttle for public/write forms — max 10 submissions per minute per
    // user (when authenticated) or per IP. Exceeding it returns 429 until the next window.
    // Deliberately NOT applied to authenticated admin data-entry (a CU may add >10 members/min).
    static string FormKey(HttpContext ctx) =>
        ctx.User.FindFirst("sub")?.Value
        ?? ctx.User.FindFirst("applicant_id")?.Value
        ?? ctx.Connection.RemoteIpAddress?.ToString()
        ?? "unknown";

    options.AddPolicy("forms", ctx => RateLimitPartition.GetFixedWindowLimiter(
        FormKey(ctx), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
        }));
});

// Global request size limit (1MB for JSON endpoints; file uploads override with [RequestSizeLimit])
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 1 * 1024 * 1024; // 1MB default
});
// Under IIS in-process hosting Kestrel's limit is ignored, so re-assert the same 1MB default for IIS.
// (Upload endpoints still override this per-action with [RequestSizeLimit].)
builder.Services.Configure<Microsoft.AspNetCore.Builder.IISServerOptions>(options =>
{
    options.MaxRequestBodySize = 1 * 1024 * 1024;
});

// When behind Cloudflare (or any trusted proxy) the connecting IP is the edge, not the visitor.
// Restore the real client IP from CF-Connecting-IP so per-IP rate limiting + request logging work —
// but ONLY honour the header when the connection actually comes from a configured Cloudflare range
// (otherwise the header is spoofable and the per-IP rate limiter could be bypassed). OFF by default;
// flip Cloudflare:Enabled=true on the server once traffic is proxied. Ranges: https://www.cloudflare.com/ips/
var cloudflareEnabled = builder.Configuration.GetValue<bool>("Cloudflare:Enabled");
if (cloudflareEnabled)
{
    var ranges = builder.Configuration.GetSection("Cloudflare:IpRanges").Get<string[]>() ?? [];
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
        options.ForwardedForHeaderName = "CF-Connecting-IP"; // Cloudflare sets this to the true client IP
        options.ForwardLimit = 1;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
        foreach (var cidr in ranges)
        {
            var parts = cidr.Split('/', 2);
            if (parts.Length == 2 && System.Net.IPAddress.TryParse(parts[0], out var ip) && int.TryParse(parts[1], out var prefix))
                options.KnownIPNetworks.Add(new System.Net.IPNetwork(ip, prefix));
        }
    });
}

var app = builder.Build();

// Apply pending migrations then run the idempotent seeders on every startup. Each Seed* call is a
// no-op when its data already exists, so this safely back-fills new permissions/profiles/settings/
// templates into databases provisioned before those features were added.
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
    var startupLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");

    // Serialize startup migrations + seeding ACROSS PROCESSES. IIS overlapped recycling briefly runs two
    // worker processes at once; without this they run the idempotent "seed-missing" back-fills concurrently
    // and the loser hits a duplicate-key (23505) — an unhandled startup exception that crash-loops the app
    // and trips IIS rapid-fail protection (root cause of the 2026-08-16 outage). A Postgres SESSION advisory
    // lock, held on ONE kept-open connection for the whole init, makes a second worker WAIT; by the time it
    // proceeds everything is already seeded, so every Seed* is a no-op. The lock auto-releases if the process
    // dies (session ends), so there is no deadlock risk.
    const long startupLockKey = 4820260816L;
    var conn = context.Database.GetDbConnection();
    await conn.OpenAsync(); // keep this connection open so the session-scoped advisory lock persists across all steps below
    await context.Database.ExecuteSqlRawAsync("SELECT pg_advisory_lock({0})", startupLockKey);
    try
    {
        await context.Database.MigrateAsync();

        var config = builder.Configuration;
        var email = config["SuperAdmin:Email"] ?? "admin@gndj.local";
        var password = config["SuperAdmin:Password"] ?? "Admin123!";
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 10);
        try
        {
            await SeedData.SeedAsync(context, email, passwordHash);
            await SeedData.SeedMissingPermissionsAsync(context);
            await SeedData.SeedChefDeGroupeProfileAsync(context);
            await SeedData.SeedAssistantDeGroupeProfileAsync(context);
            await SeedData.SeedScoutStructureAsync(context);
            await SeedData.SeedMissingSettingsAsync(context);
            await SeedData.SeedDefaultEmailTemplatesAsync(context);
            await SeedData.SeedDemandeEmailTemplatesAsync(context);
            await SeedData.SeedContactEmailTemplateAsync(context);
            await SeedData.SeedMemberEmailTemplatesAsync(context);
            await SeedData.SeedFunctionalRoleRanksAsync(context);
            await SeedData.SeedFunctionalRoleTeamLeaderAsync(context);
            await SeedData.SeedRentreeTemplateAsync(context);
            await SeedData.SeedRentreeActionKeysAsync(context);
            await SeedData.SeedRentreeReminderTaskAsync(context);
            await SeedData.SeedRentreeExtraTasksAsync(context);
            await SeedData.SeedRentreeAnchorsAndProgressAsync(context);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        {
            // Defense-in-depth (the advisory lock should already prevent this): a raced/duplicate seed insert
            // must NEVER crash the app on startup — the row it was adding already exists. Log and carry on.
            startupLogger.LogWarning(ex, "Startup seeding hit a duplicate key (already seeded / concurrent start) — continuing.");
        }

        // One-off DATA patches (deploy/patches/*.sql, copied to <ContentRoot>/DataPatches on publish). Applied
        // exactly once each — tracked in the data_patches table — for data changes the migrations/seeders don't
        // carry. See deploy/patches/README.md.
        // AppContext.BaseDirectory (the app's binary folder) is where the .sql files are copied — this matches
        // both `dotnet run` (bin/…) and a published app (the deploy folder), unlike ContentRootPath.
        var patchLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DataPatches");
        await DataPatchRunner.RunAsync(context, Path.Combine(AppContext.BaseDirectory, "DataPatches"), patchLogger);
    }
    finally
    {
        // Release the advisory lock (also auto-released on connection close / process exit).
        await context.Database.ExecuteSqlRawAsync("SELECT pg_advisory_unlock({0})", startupLockKey);
    }
}

// Middleware pipeline
// Must run FIRST so the rate limiter, abuse middleware and request logging all see the real client IP.
if (cloudflareEnabled)
    app.UseForwardedHeaders();

app.UseResponseCompression();
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Content-Security-Policy for the served SPA. Tuned to what the app actually loads (verified):
//   script-src 'self'        — the Vite build emits only external hashed modules (no inline scripts)
//   style-src 'unsafe-inline'— React inline style={{…}} attributes + Tailwind need it (no nonce with a static build)
//   img-src blob: data: https: — member photos are blob: object URLs; CMS/News content can embed external images
//   connect-src 'self'       — the whole API is same-origin; there are no external fetch/CDN origins
//   frame-ancestors 'none'   — clickjacking guard (reinforces X-Frame-Options)
// Applied to every response; harmless on API JSON (CSP governs document resource loading).
const string csp =
    "default-src 'self'; " +
    "base-uri 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "form-action 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https:; " +
    "font-src 'self'; " +
    "media-src 'self'; " +
    "connect-src 'self'";

// CSP is enforced outside Development only: the dev-only Swagger UI relies on inline scripts/styles that a
// strict script-src/style-src would block. Production doesn't serve Swagger, so it gets the full policy.
var applyCsp = !app.Environment.IsDevelopment();

// Security headers + static asset caching
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-Permitted-Cross-Domain-Policies"] = "none";
    // Restrict powerful browser features to just what the app uses: camera=self for the photo-session
    // capture (getUserMedia), everything else denied. COOP/CORP isolate our browsing context + resources
    // (defense-in-depth; COEP is deliberately NOT set — 'require-corp' would block CMS-embedded external images).
    context.Response.Headers["Permissions-Policy"] =
        "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()";
    context.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
    context.Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
    if (applyCsp)
        context.Response.Headers["Content-Security-Policy"] = csp;
    await next();
});

// Production transport hardening (TLS terminates at IIS / the reverse proxy).
if (!app.Environment.IsDevelopment())
    app.UseHsts();

// Serve the React build (copied into wwwroot at publish time) so the API and SPA share one origin.
// API routes are matched by controllers first; everything else falls back to the SPA shell below.
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    // Cache policy for the SPA build. Vite emits content-hashed filenames under /assets
    // (app.<hash>.js, etc.) which can never change content, so cache them for a year and mark
    // them immutable — this is what lets the browser AND Cloudflare's edge skip revalidation.
    // Everything else (index.html, favicon, manifest) must be revalidated so a new deploy is
    // picked up immediately rather than being served from a stale cache.
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value ?? string.Empty;
        ctx.Context.Response.Headers.CacheControl =
            path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase)
                ? "public, max-age=31536000, immutable"
                : "no-cache";
    },
});

// ACME HTTP-01 challenge (Let's Encrypt / win-acme): serve the extensionless token files written to the
// site root's .well-known/acme-challenge. Without this, the SPA fallback below returns index.html for the
// challenge URL and cert issuance + every auto-renewal fail. Dot-prefixed dirs are excluded by the default
// static-file provider, so we serve them explicitly with no exclusion filters.
var acmeChallengePath = Path.Combine(app.Environment.ContentRootPath, ".well-known", "acme-challenge");
Directory.CreateDirectory(acmeChallengePath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(acmeChallengePath, ExclusionFilters.None),
    RequestPath = "/.well-known/acme-challenge",
    ServeUnknownFileTypes = true,
    DefaultContentType = "text/plain",
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "GNDJ Scout API v1");
        options.RoutePrefix = "swagger";
    });
    app.UseCors("Development");
}

app.UseAuthentication();
// API-key auth runs AFTER JWT authentication and BEFORE authorization: it only kicks in when no
// JWT principal was set, populating an equivalent ClaimsPrincipal so [HasPermission] still applies.
app.UseMiddleware<ApiKeyMiddleware>();
app.UseAuthorization();

// Maintenance/kill-switches — after auth (needs the super-admin claim to grant them access) so a module
// (or the whole site) in maintenance returns 503 to everyone else. Only gates /api/*; the SPA still loads.
app.UseMiddleware<MaintenanceMiddleware>();

// Serilog request logging (after auth so user context is available)
app.UseSerilogRequestLogging(options =>
{
    options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
    {
        var userId = httpContext.User.FindFirst("sub")?.Value;
        var memberId = httpContext.User.FindFirst("member_id")?.Value;
        if (userId is not null) diagnosticContext.Set("UserId", userId);
        if (memberId is not null) diagnosticContext.Set("MemberId", memberId);
        diagnosticContext.Set("RemoteIP", httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    };
    options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.000}ms";
    // ExceptionHandlingMiddleware sits OUTSIDE this middleware, so an exception that it translates into a clean
    // 4xx still propagates through here first — Serilog would otherwise log it as a 500 with a full stack trace
    // and persist it to application_logs (the DB sink is Warning+), flooding the "Journal des erreurs" page with
    // non-errors (every form-validation failure, permission denial, duplicate-key, or PDF layout issue) and
    // burying genuine faults. Downgrade the exception types that are deliberately mapped to 4xx to Information
    // (below the DB threshold); real unhandled faults and 5xx responses stay Error.
    options.GetLevel = (httpContext, _, ex) =>
    {
        if (ex is ValidationException or UnauthorizedAccessException) return LogEventLevel.Information;
        if (ex is DbUpdateException { InnerException: Npgsql.PostgresException }) return LogEventLevel.Information;
        if (ex is not null && ex.GetType().FullName?.StartsWith("QuestPDF", StringComparison.Ordinal) == true) return LogEventLevel.Information;
        if (ex is not null || httpContext.Response.StatusCode >= 500) return LogEventLevel.Error;
        return LogEventLevel.Information;
    };
});

app.UseOutputCache();
app.UseRateLimiter();
// After the rate limiter (so flooders are throttled first) and after auth (so rejections can log
// the user) — scans JSON write bodies for honeypot/attack signatures before they reach controllers.
app.UseMiddleware<AbuseDetectionMiddleware>();
app.MapHealthChecks("/health");
app.MapControllers();

// SPA client-side routing: any non-API, non-file request returns index.html.
app.MapFallbackToFile("index.html");

Log.Information("GNDJ API started on {Urls}", string.Join(", ", app.Urls));
Console.WriteLine($"GNDJ API listening on: {string.Join(", ", app.Urls)}");

app.Run();

// Accessor for current user from HttpContext (used by EF interceptors)
public class HttpContextCurrentUserAccessor : ICurrentUserAccessor
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public HttpContextCurrentUserAccessor(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("sub");
            return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : null;
        }
    }
}
