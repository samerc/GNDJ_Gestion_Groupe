using GNDJ.Api.Authorization;
using GNDJ.Application.Public;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// In-app inbox for public contact-form submissions (base route <c>api/v1/contact-messages</c>). Managers
/// view, mark read, reply, and delete messages here. All endpoints require the content.manage permission
/// (super-admin / association-admin / Chef de Groupe / ACG) — the same permission that governs the public site.
/// </summary>
[Authorize]
[Route("api/v1/contact-messages")]
public class ContactMessagesController : BaseApiController
{
    /// <summary>Lists contact messages (unread first, then newest), paged. Optional accent-insensitive search + unread filter.</summary>
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> List([FromQuery] string? search = null, [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        => Ok(await Mediator.Send(new GetContactMessagesQuery(search, unreadOnly, page, pageSize)));

    /// <summary>Unread count for the sidebar badge.</summary>
    [HttpGet("unread-count")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> UnreadCount()
        => Ok(new { count = await Mediator.Send(new GetUnreadContactMessageCountQuery()) });

    /// <summary>Mark one message read / unread.</summary>
    [HttpPost("{id:guid}/read")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> MarkRead(Guid id, [FromBody] MarkReadBody body)
    {
        var result = await Mediator.Send(new MarkContactMessageReadCommand(id, body.Read));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Reply to a message — queues a "Re:" email to the sender and records the reply.</summary>
    [HttpPost("{id:guid}/reply")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Reply(Guid id, [FromBody] ReplyBody body)
    {
        var result = await Mediator.Send(new ReplyContactMessageCommand(id, body.Subject, body.Body));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Delete a message (soft-delete).</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteContactMessageCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    public record MarkReadBody(bool Read);
    public record ReplyBody(string Subject, string Body);
}
