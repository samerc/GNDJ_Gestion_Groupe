using System.Text;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Identity;
using GNDJ.Infrastructure.Persistence;
using GNDJ.Infrastructure.Persistence.Interceptors;
using GNDJ.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace GNDJ.Infrastructure;

// Composition root for the Infrastructure layer: wires the pooled EF Core context + interceptors,
// identity & email/PDF services, and JWT bearer authentication.
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // EF Core interceptors — SINGLETON so they can be shared by a POOLED DbContext.
        // They hold no per-request state: the only dependency is ICurrentUserAccessor, which reads the
        // current user lazily from IHttpContextAccessor (also singleton) at SaveChanges time. This is what
        // makes DbContext pooling safe — a pooled context's options (incl. interceptors) are fixed for the
        // app lifetime, so capturing scoped state here would leak across requests; reading it lazily does not.
        services.AddSingleton<AuditableEntityInterceptor>();
        services.AddSingleton<SoftDeleteInterceptor>();

        // Database — POOLED. AddDbContextPool reuses context instances (skips the model-metadata/change-tracker
        // wiring per request), a meaningful allocation/GC saving under the 100-150 concurrent-user target.
        services.AddDbContextPool<GndjDbContext>((sp, options) =>
        {
            var auditInterceptor = sp.GetRequiredService<AuditableEntityInterceptor>();
            var softDeleteInterceptor = sp.GetRequiredService<SoftDeleteInterceptor>();

            var connStr = configuration.GetConnectionString("DefaultConnection");
            options.UseNpgsql(connStr, npgsqlOptions =>
                   {
                       npgsqlOptions.CommandTimeout(30);
                       npgsqlOptions.MinBatchSize(2);
                       npgsqlOptions.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery);
                   })
                   .UseSnakeCaseNamingConvention()
                   .AddInterceptors(auditInterceptor, softDeleteInterceptor);
            // NOTE: Do NOT set a global NoTracking default — it silently breaks the
            // FindAsync + modify + SaveChanges update pattern used across all command handlers.
            // List queries already project to DTOs (.Select), which EF does not track anyway.
        });

        // DbContext interface for Application layer
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<GndjDbContext>());

        // Identity services
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        // Configurable password-complexity policy (security.password_* settings), read by the password validators.
        services.AddScoped<IPasswordPolicy, PasswordPolicyService>();
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<ICurrentApplicantService, CurrentApplicantService>();
        services.AddScoped<IAuditService, AuditService>();

        // Email service + durable outbox queue. Enqueuing persists an email_outbox row (survives restart);
        // the OutboxSenderBackgroundService (registered in the API host) drains it. The signal lets an
        // enqueue wake the sender immediately instead of waiting for its poll interval.
        services.AddScoped<IEmailService, EmailService>();
        services.AddSingleton<IOutboxSignal, OutboxSignal>();
        services.AddSingleton<IEmailQueue, OutboxEmailQueue>();

        // Best-effort admin alerting on server/client errors (singleton: owns its own scope, never throws).
        services.AddSingleton<IErrorNotifier, ErrorNotifier>();

        // Read-only access to Serilog's application_logs table for the super-admin error journal.
        services.AddScoped<IErrorLogReader, ErrorLogReader>();

        // Maintenance/kill-switch state (cached), read by the maintenance middleware + public status endpoint.
        services.AddScoped<IMaintenanceProvider, MaintenanceProvider>();

        // Permanent purge of soft-deleted members past the retention window (driven by a hosted job).
        services.AddScoped<IMemberPurgeService, MemberPurgeService>();

        // PDF services
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
        services.AddSingleton<IReceiptService, ReceiptService>();
        services.AddSingleton<ITrombinoscoreService, TrombinoscoreService>();
        services.AddSingleton<IMemberCardService, MemberCardService>();
        services.AddSingleton<IRosterService, RosterService>();
        services.AddSingleton<ICampReportService, CampReportService>();
        services.AddSingleton<IExportService, ExportService>();
        services.AddSingleton<IDemandeSheetService, DemandeSheetService>(); // Excel export/import of CG decisions

        // JWT Authentication
        // Fail-safe against a weak/default signing key: a forgeable secret = full account takeover, so we
        // refuse to start rather than run with the committed placeholder. Dev may keep the placeholder;
        // any non-Development environment MUST supply a unique secret (appsettings.Production.json or the
        // JWT__SECRET env var). Also enforce a minimum length so a short key can't be brute-forced.
        var jwtSecret = configuration["Jwt:Secret"];
        var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var isDevelopment = string.Equals(env, "Development", StringComparison.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
            throw new InvalidOperationException(
                "Jwt:Secret is missing or too short (>= 32 chars required). Set a strong random secret via " +
                "appsettings.Production.json or the JWT__SECRET environment variable.");
        if (!isDevelopment && jwtSecret.Contains("CHANGE_THIS"))
            throw new InvalidOperationException(
                "Jwt:Secret is still the placeholder value. Generate a unique secret for this environment " +
                "before starting outside Development.");
        var key = Encoding.UTF8.GetBytes(jwtSecret);

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = configuration["Jwt:Issuer"],
                ValidAudience = configuration["Jwt:Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ClockSkew = TimeSpan.Zero,
                NameClaimType = "sub"
            };
        });

        return services;
    }
}
