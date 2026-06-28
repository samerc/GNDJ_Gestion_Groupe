using GNDJ.Application.AuditLogs;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Read-only audit-log viewer — base route api/v1/audit-logs (overrides the [controller] default).
// [Authorize] = JWT or API-key required; everything gated by AuditView (admin).
[Authorize]
[Route("api/v1/audit-logs")]
public class AuditLogsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AuditView)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? entityType, [FromQuery] string? action, [FromQuery] Guid? userId,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var result = await Mediator.Send(new GetAuditLogsQuery(entityType, action, userId, from, to, page, pageSize));
        return Ok(result);
    }

    // /filters — distinct entity types / actions / users to populate the viewer's filter dropdowns.
    [HttpGet("filters")]
    [HasPermission(Permissions.AuditView)]
    public async Task<IActionResult> GetFilters()
    {
        var result = await Mediator.Send(new GetAuditFilterOptionsQuery());
        return Ok(result);
    }
}
