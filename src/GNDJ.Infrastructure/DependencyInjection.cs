using System.Text;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Interfaces;
using GNDJ.Infrastructure.Identity;
using GNDJ.Infrastructure.Persistence;
using GNDJ.Infrastructure.Persistence.Interceptors;
using GNDJ.Infrastructure.Persistence.Repositories;
using GNDJ.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace GNDJ.Infrastructure;

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

        // Repositories
        services.AddScoped(typeof(IRepository<>), typeof(GenericRepository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Identity services
        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<ICurrentApplicantService, CurrentApplicantService>();
        services.AddScoped<IAuditService, AuditService>();

        // Email service + background queue
        services.AddScoped<IEmailService, EmailService>();
        services.AddSingleton<EmailQueue>();
        services.AddSingleton<IEmailQueue>(sp => sp.GetRequiredService<EmailQueue>());

        // PDF services
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
        services.AddSingleton<IReceiptService, ReceiptService>();
        services.AddSingleton<ITrombinoscoreService, TrombinoscoreService>();
        services.AddSingleton<IMemberCardService, MemberCardService>();
        services.AddSingleton<IRosterService, RosterService>();
        services.AddSingleton<ICampReportService, CampReportService>();
        services.AddSingleton<IExportService, ExportService>();

        // JWT Authentication
        var jwtSecret = configuration["Jwt:Secret"]!;
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
