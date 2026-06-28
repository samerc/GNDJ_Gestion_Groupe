using Microsoft.AspNetCore.Authorization;

namespace GNDJ.Api.Authorization;

// Carries the single permission string (e.g. "documents.upload") that the
// PermissionAuthorizationHandler must find in the caller's claims to succeed.
public class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }

    public PermissionRequirement(string permission)
    {
        Permission = permission;
    }
}
