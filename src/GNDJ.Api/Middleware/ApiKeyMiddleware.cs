using System.Security.Claims;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Middleware;

public class ApiKeyMiddleware
{
    private readonly RequestDelegate _next;

    // Map API key scopes to internal permissions
    private static readonly Dictionary<string, string[]> ScopeToPermissions = new()
    {
        ["members:read-own"] = ["members.view"],
        ["members:read"] = ["members.view"],
        ["members:write"] = ["members.view", "members.create", "members.edit", "members.delete"],
        ["documents:upload"] = ["documents.view", "documents.create"],
        ["documents:read"] = ["documents.view"],
        ["cotisations:read-own"] = ["cotisations.view"],
        ["cotisations:read"] = ["cotisations.view"],
    };

    public ApiKeyMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // Only process if no JWT auth already set AND X-API-Key header present
        if (context.User.Identity?.IsAuthenticated == true || !context.Request.Headers.TryGetValue("X-API-Key", out var apiKeyHeader))
        {
            await _next(context);
            return;
        }

        var apiKeyValue = apiKeyHeader.ToString();
        if (string.IsNullOrWhiteSpace(apiKeyValue))
        {
            await _next(context);
            return;
        }

        if (apiKeyValue.Length < 8)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Clé API invalide." });
            return;
        }

        var prefix = apiKeyValue[..8];
        var db = context.RequestServices.GetRequiredService<GndjDbContext>();

        var candidates = await db.ApiKeys
            .Where(k => k.KeyPrefix == prefix && k.IsActive && !k.IsDeleted)
            .ToListAsync();

        ApiKey? matchedKey = null;
        foreach (var candidate in candidates)
        {
            if (BCrypt.Net.BCrypt.Verify(apiKeyValue, candidate.KeyHash))
            {
                matchedKey = candidate;
                break;
            }
        }

        if (matchedKey is null)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Clé API invalide." });
            return;
        }

        if (matchedKey.ExpiresAt.HasValue && matchedKey.ExpiresAt.Value < DateTime.UtcNow)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Clé API expirée." });
            return;
        }

        // Update last used
        matchedKey.LastUsedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Resolve permissions from scopes
        var scopes = matchedKey.Scopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var permissions = new HashSet<string>();
        foreach (var scope in scopes)
        {
            if (ScopeToPermissions.TryGetValue(scope, out var perms))
                foreach (var p in perms) permissions.Add(p);
        }

        // Build claims matching what CurrentUserService + PermissionAuthorizationHandler expect
        var claims = new List<Claim>
        {
            new("api_key", "true"),
            new("api_key_id", matchedKey.Id.ToString()),
            new("api_key_name", matchedKey.Name),
            new("permissions", string.Join(",", permissions)),
        };

        if (matchedKey.MemberId.HasValue)
        {
            claims.Add(new("member_id", matchedKey.MemberId.Value.ToString()));

            // Resolve unit access for this member
            var unitIds = await db.MemberAssignments
                .Where(a => a.MemberId == matchedKey.MemberId.Value && a.EndDate == null && !a.IsDeleted)
                .Select(a => a.UnitId)
                .Distinct()
                .ToListAsync();
            if (unitIds.Count > 0)
                claims.Add(new("unit_ids", string.Join(",", unitIds)));
        }

        var identity = new ClaimsIdentity(claims, "ApiKey");
        context.User = new ClaimsPrincipal(identity);

        await _next(context);
    }
}
