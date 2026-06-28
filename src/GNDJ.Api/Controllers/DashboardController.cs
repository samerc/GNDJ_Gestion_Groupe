using GNDJ.Application.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Dashboard aggregates: unit-leader roster view + CG/admin overview.
// Route: api/v1/dashboard (no explicit [Route] — BaseApiController convention). [Authorize] = JWT/API-key.
// No permission attributes — handlers enforce unit-scope / super-admin themselves.
[Authorize]
public class DashboardController : BaseApiController
{
    [HttpGet("unit/{unitId:guid}")]
    public async Task<IActionResult> GetUnitDashboard(Guid unitId)
    {
        var result = await Mediator.Send(new GetUnitDashboardQuery(unitId));
        // Handler returns null when the caller has no access to this unit -> 403 (IDOR guard).
        if (result is null) return Forbid();
        return Ok(result);
    }

    // scoutYear scopes every tile to assignments active during that Oct 1->Oct 1 window.
    [HttpGet("admin")]
    public async Task<IActionResult> GetAdminDashboard([FromQuery] string scoutYear = "2025-2026")
    {
        var result = await Mediator.Send(new GetAdminDashboardQuery(scoutYear));
        return Ok(result);
    }
}
