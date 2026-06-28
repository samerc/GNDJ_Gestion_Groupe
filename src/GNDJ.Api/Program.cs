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
        .WriteTo.File("logs/gndj-.log", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 30,
            outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
        .WriteTo.PostgreSQL(connStr!, "application_logs", columnWriters,
            needAutoCreateTable: true, restrictedToMinimumLevel: LogEventLevel.Warning);
});

// Infrastructure (EF Core, repositories, JWT auth, services)
builder.Services.AddHttpContextAccessor();
// Singleton (not scoped): consumed by the singleton EF interceptors used with the pooled DbContext.
// It is stateless — it reads the current request's user lazily from the singleton IHttpContextAccessor.
builder.Services.AddSingleton<ICurrentUserAccessor, HttpContextCurrentUserAccessor>();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHostedService<GNDJ.Api.Services.EmailQueueBackgroundService>();

// Performance: Settings cache (singleton, auto-refreshes every 5 min)
builder.Services.AddSingleton<ISettingsCacheService, SettingsCacheService>();

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

// Liveness endpoint (anonymous) — used by the IIS Application Initialization warm-up probe so the app
// is hot before the first real user, and by uptime monitoring. The EF model is already built during
// startup (migrate + seed), so this stays a cheap liveness check.
builder.Services.AddHealthChecks();

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

// Seed database
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
    await context.Database.MigrateAsync();

    var config = builder.Configuration;
    var email = config["SuperAdmin:Email"] ?? "admin@gndj.local";
    var password = config["SuperAdmin:Password"] ?? "Admin123!";
    var passwordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 10);
    await SeedData.SeedAsync(context, email, passwordHash);
    await SeedData.SeedMissingPermissionsAsync(context);
    await SeedData.SeedChefDeGroupeProfileAsync(context);
    await SeedData.SeedAssistantDeGroupeProfileAsync(context);
    await SeedData.SeedMissingSettingsAsync(context);
    await SeedData.SeedDefaultEmailTemplatesAsync(context);
    await SeedData.SeedDemandeEmailTemplatesAsync(context);
    await SeedData.SeedContactEmailTemplateAsync(context);
    await SeedData.SeedFunctionalRoleRanksAsync(context);
    await SeedData.SeedRentreeTemplateAsync(context);
}

// Middleware pipeline
// Must run FIRST so the rate limiter, abuse middleware and request logging all see the real client IP.
if (cloudflareEnabled)
    app.UseForwardedHeaders();

app.UseResponseCompression();
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Security headers + static asset caching
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-Permitted-Cross-Domain-Policies"] = "none";
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
app.UseMiddleware<ApiKeyMiddleware>();
app.UseAuthorization();

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
});

app.UseOutputCache();
app.UseRateLimiter();
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
