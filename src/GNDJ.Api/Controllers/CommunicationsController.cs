using GNDJ.Api.Authorization;
using GNDJ.Application.Communications;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// CG communications — send an email template to selected leaders (chefs). Base route <c>api/v1/communications</c>.
/// Every action requires maitrise.manage (Chef de Groupe / super-admin).
/// </summary>
[Authorize]
public class CommunicationsController : BaseApiController
{
    /// <summary>Lists leader recipients (members with an active maîtrise assignment), optionally scoped to a unit
    /// and/or only those who never logged in. Requires maitrise.manage.</summary>
    [HttpGet("leaders")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Leaders([FromQuery] Guid? unitId = null, [FromQuery] bool neverLoggedInOnly = false)
    {
        var result = await Mediator.Send(new GetLeaderRecipientsQuery(unitId, neverLoggedInOnly));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Lists the active email templates (id/name/code/subject/body) a CG can send + preview. Requires
    /// maitrise.manage — a CG-accessible read-only view of the templates (editing stays super-admin).</summary>
    [HttpGet("templates")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Templates()
    {
        var result = await Mediator.Send(new GetLeaderMessageTemplatesQuery());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Sends the chosen email template to the selected leaders (queued via the durable outbox). Returns a
    /// sent / no-email report. Requires maitrise.manage.</summary>
    [HttpPost("send")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Send([FromBody] SendLeaderMessageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }
}
