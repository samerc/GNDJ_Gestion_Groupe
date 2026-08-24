using GNDJ.Application.AuditLogs;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Read-only audit-log viewer. Base route api/v1/audit-logs. Requires JWT or API-key auth; every action requires
/// audit.view (admin).
/// </summary>
[Authorize]
[Route("api/v1/audit-logs")]
public class AuditLogsController : BaseApiController
{
    /// <summary>Lists audit-log entries filtered by entity, action, user and date range, paginated. Requires audit.view.</summary>
    /// <param name="entityType">Filter to a single audited entity type.</param>
    /// <param name="action">Filter to a single action (Create, Update, Delete, etc.).</param>
    /// <param name="userId">Filter to entries produced by this user.</param>
    /// <param name="from">Lower bound (inclusive) on the entry timestamp.</param>
    /// <param name="to">Upper bound (inclusive) on the entry timestamp.</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Page size.</param>
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

    /// <summary>Returns the distinct entity types, actions and users to populate the viewer's filter dropdowns. Requires audit.view.</summary>
    [HttpGet("filters")]
    [HasPermission(Permissions.AuditView)]
    public async Task<IActionResult> GetFilters()
    {
        var result = await Mediator.Send(new GetAuditFilterOptionsQuery());
        return Ok(result);
    }

    /// <summary>Clears the audit trail. SUPER-ADMIN only (enforced in the handler). Optional ?before= keeps newer entries.</summary>
    /// <response code="200">Number of rows deleted.</response>
    /// <response code="403">Not a super-admin.</response>
    [HttpDelete]
    [HasPermission(Permissions.AuditView)]
    public async Task<IActionResult> Clear([FromQuery] DateTime? before)
    {
        var deleted = await Mediator.Send(new PurgeAuditLogsCommand(before));
        return Ok(new { deleted });
    }
}
