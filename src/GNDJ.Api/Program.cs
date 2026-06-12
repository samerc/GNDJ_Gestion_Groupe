using System.IO.Compression;
using System.Threading.RateLimiting;
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
builder.Services.AddScoped<ICurrentUserAccessor, HttpContextCurrentUserAccessor>();
builder.Services.AddInfrastructure(builder.Configuration);

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
});

// Global request size limit (1MB for JSON endpoints; file uploads override with [RequestSizeLimit])
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 1 * 1024 * 1024; // 1MB default
});

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
    await SeedData.SeedMissingSettingsAsync(context);
    await SeedData.SeedDefaultEmailTemplatesAsync(context);
}

// Middleware pipeline
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
app.MapControllers();

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
