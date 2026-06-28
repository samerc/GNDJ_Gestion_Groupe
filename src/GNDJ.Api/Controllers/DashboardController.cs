using GNDJ.Application.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Dashboard aggregates: unit-leader roster view and CG/admin overview. Base route follows the BaseApiController
/// convention (no explicit [Route]); requires authentication (JWT/API-key). No permission attributes — handlers
/// enforce unit-scope / super-admin access themselves.
/// </summary>
[Authorize]
public class DashboardController : BaseApiController
{
    /// <summary>
    /// Returns the unit-leader dashboard (roster + aggregates) for a unit. Returns 403 if the caller cannot access
    /// the unit (IDOR guard).
    /// </summary>
    [HttpGet("unit/{unitId:guid}")]
    public async Task<IActionResult> GetUnitDashboard(Guid unitId)
    {
        var result = await Mediator.Send(new GetUnitDashboardQuery(unitId));
        // Handler returns null when the caller has no access to this unit -> 403 (IDOR guard).
        if (result is null) return Forbid();
        return Ok(result);
    }

    /// <summary>
    /// Returns the CG/admin overview (totals, gender, units, ages, unpaid, docs). Super-admin or group-level access
    /// enforced in the handler.
    /// </summary>
    /// <param name="scoutYear">Scout year that scopes every tile to assignments active during that Oct 1 to Oct 1 window.</param>
    [HttpGet("admin")]
    public async Task<IActionResult> GetAdminDashboard([FromQuery] string scoutYear = "2025-2026")
    {
        var result = await Mediator.Send(new GetAdminDashboardQuery(scoutYear));
        return Ok(result);
    }
}
