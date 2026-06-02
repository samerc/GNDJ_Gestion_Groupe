using Microsoft.AspNetCore.Authorization;

namespace GNDJ.Api.Authorization;

public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var isSuperAdmin = context.User.FindFirst("is_super_admin")?.Value == "true";
        if (isSuperAdmin)
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        var permissionsClaim = context.User.FindFirst("permissions")?.Value;
        if (string.IsNullOrEmpty(permissionsClaim))
            return Task.CompletedTask;

        var permissions = permissionsClaim.Split(',', StringSplitOptions.RemoveEmptyEntries);
        if (permissions.Contains(requirement.Permission))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
