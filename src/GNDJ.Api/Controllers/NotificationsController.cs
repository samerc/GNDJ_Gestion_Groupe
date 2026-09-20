using GNDJ.Api.Authorization;
using GNDJ.Application.Notifications;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// In-app notifications for the CURRENT user (base route api/v1/notifications). Auth-only — every handler
/// resolves the recipient from the authenticated member id, so a user only ever reads / marks their own
/// (no permission needed, no IDOR surface).
/// </summary>
[Authorize]
[Route("api/v1/notifications")]
public class NotificationsController : BaseApiController
{
    /// <summary>The caller's notifications, newest first (paged). unreadOnly filters to unread.</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] bool unreadOnly = false)
        => Ok(await Mediator.Send(new GetNotificationsQuery(page, pageSize, unreadOnly)));

    /// <summary>Unread count for the bell badge.</summary>
    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount() => Ok(new { count = await Mediator.Send(new GetUnreadNotificationCountQuery()) });

    /// <summary>Mark one notification read (idempotent; a foreign id is a no-op).</summary>
    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var result = await Mediator.Send(new MarkNotificationReadCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Mark all of the caller's notifications read.</summary>
    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var result = await Mediator.Send(new MarkAllNotificationsReadCommand());
        return Ok(new { updated = result.Value });
    }

    /// <summary>Delete all of the caller's READ notifications. (Route is before {id} so "read" isn't taken as a guid.)</summary>
    [HttpDelete("read")]
    public async Task<IActionResult> ClearRead()
    {
        var result = await Mediator.Send(new ClearReadNotificationsCommand());
        return Ok(new { deleted = result.Value });
    }

    /// <summary>The caller's muted notification categories.</summary>
    [HttpGet("preferences")]
    public async Task<IActionResult> Preferences()
        => Ok(await Mediator.Send(new GetNotificationPreferencesQuery()));

    /// <summary>Update the caller's muted notification categories.</summary>
    [HttpPut("preferences")]
    public async Task<IActionResult> UpdatePreferences([FromBody] UpdatePreferencesBody body)
    {
        var result = await Mediator.Send(new UpdateNotificationPreferencesCommand(body.MutedTypes ?? []));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    public record UpdatePreferencesBody(List<string>? MutedTypes);

    /// <summary>Delete one notification (idempotent; a foreign id is a no-op).</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteNotificationCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Send a targeted notification (in-app + Web Push) to chosen members / a unit / a member group.
    /// Group-manager only (super-admin / Chef de Groupe / ACG). Returns the recipient count.</summary>
    [HttpPost("send")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Send([FromBody] SendPushNotificationCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { count = result.Value }) : BadRequest(new { error = result.Error });
    }
}
