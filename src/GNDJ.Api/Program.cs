using GNDJ.Api.Authorization;
using GNDJ.Api.Middleware;
using GNDJ.Infrastructure;
using GNDJ.Infrastructure.Persistence;
using GNDJ.Infrastructure.Persistence.Interceptors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Infrastructure (EF Core, repositories, JWT auth, services)
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserAccessor, HttpContextCurrentUserAccessor>();
builder.Services.AddInfrastructure(builder.Configuration);

// MediatR + FluentValidation
builder.Services.AddMediator(options => options.ServiceLifetime = ServiceLifetime.Scoped);

// Authorization
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();

// Controllers
builder.Services.AddControllers();
builder.Services.AddOpenApi();

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

var app = builder.Build();

// Seed database
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
    await context.Database.MigrateAsync();

    var config = builder.Configuration;
    var email = config["SuperAdmin:Email"] ?? "admin@gndj.local";
    var password = config["SuperAdmin:Password"] ?? "Admin123!";
    var passwordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);
    await SeedData.SeedAsync(context, email, passwordHash);
    await SeedData.SeedMissingSettingsAsync(context);
}

// Middleware pipeline
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("Development");
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

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
