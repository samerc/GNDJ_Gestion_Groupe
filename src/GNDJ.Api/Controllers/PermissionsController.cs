using GNDJ.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Permission taxonomy (French labels + domain grouping) — the single source of truth shared by the
/// effective-access viewer and the permission editors, so a permission is always presented the same way.
/// Static reference data (no member data), so any authenticated user may read it.
/// </summary>
[Authorize]
public class PermissionsController : BaseApiController
{
    /// <summary>The permission catalog: domains (in reading order) + every permission with its domain + label.</summary>
    [HttpGet("catalog")]
    public IActionResult Catalog() => Ok(new
    {
        domains = PermissionCatalog.Domains.Select(d => new { key = d.Key, label = d.Label }),
        permissions = PermissionCatalog.All.Select(p => new { key = p.Key, domainKey = p.DomainKey, label = p.Label }),
    });
}
