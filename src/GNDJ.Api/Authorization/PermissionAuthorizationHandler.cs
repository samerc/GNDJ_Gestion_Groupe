using Microsoft.AspNetCore.Authorization;

namespace GNDJ.Api.Authorization;

// Resolves a PermissionRequirement against the caller's JWT/API-key claims.
// The claims ("is_super_admin", "permissions") are baked in at login/refresh (and by the
// API-key middleware), so this check is purely claim-based — no DB hit per request.
public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        // Super admin short-circuits every permission check.
        var isSuperAdmin = context.User.FindFirst("is_super_admin")?.Value == "true";
        if (isSuperAdmin)
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        // "permissions" is a single comma-joined claim (e.g. "members.view,documents.upload").
        var permissionsClaim = context.User.FindFirst("permissions")?.Value;
        if (string.IsNullOrEmpty(permissionsClaim))
            return Task.CompletedTask; // no permissions claim → leave unfulfilled → 403

        var permissions = permissionsClaim.Split(',', StringSplitOptions.RemoveEmptyEntries);
        if (permissions.Contains(requirement.Permission))
        {
            context.Succeed(requirement);
        }

        // Not calling Fail(): an unfulfilled requirement is enough to deny.
        return Task.CompletedTask;
    }
}
