using Microsoft.AspNetCore.Authorization;

namespace GNDJ.Api.Authorization;

// Declarative permission gate: [HasPermission("members.edit")] on an action/controller.
// It's just an AuthorizeAttribute whose policy name is "Permission:{permission}" — the
// PermissionPolicyProvider materializes that name into a policy on demand, and the
// PermissionAuthorizationHandler checks it against the caller's claims.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class HasPermissionAttribute : AuthorizeAttribute
{
    public HasPermissionAttribute(string permission) : base($"Permission:{permission}")
    {
    }
}
