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
        // EF Core interceptors
        services.AddScoped<AuditableEntityInterceptor>();
        services.AddScoped<SoftDeleteInterceptor>();

        // Database
        services.AddDbContext<GndjDbContext>((sp, options) =>
        {
            var auditInterceptor = sp.GetRequiredService<AuditableEntityInterceptor>();
            var softDeleteInterceptor = sp.GetRequiredService<SoftDeleteInterceptor>();

            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection"))
                   .UseSnakeCaseNamingConvention()
                   .AddInterceptors(auditInterceptor, softDeleteInterceptor);
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
        services.AddScoped<IAuditService, AuditService>();

        // PDF services
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
        services.AddSingleton<IReceiptService, ReceiptService>();

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
