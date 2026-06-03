using GNDJ.Application.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
public class DashboardController : BaseApiController
{
    [HttpGet("unit/{unitId:guid}")]
    public async Task<IActionResult> GetUnitDashboard(Guid unitId)
    {
        var result = await Mediator.Send(new GetUnitDashboardQuery(unitId));
        if (result is null) return Forbid();
        return Ok(result);
    }

    [HttpGet("admin")]
    public async Task<IActionResult> GetAdminDashboard([FromQuery] string schoolYear = "2025-2026")
    {
        var result = await Mediator.Send(new GetAdminDashboardQuery(schoolYear));
        return Ok(result);
    }
}
