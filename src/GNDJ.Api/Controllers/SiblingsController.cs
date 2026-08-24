using GNDJ.Api.Authorization;
using GNDJ.Application.Siblings;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Fratries (sibling groups): auto-suggest likely siblings, approve (with parent/address/contact reconciliation)
/// or reject them, link/unlink manually, and read a member's confirmed siblings. Route api/v1/siblings.
/// Management is CG/super-admin only (maitrise.manage); the per-member read is gated by MemberAccess in the handler
/// so it can also power "Frères et sœurs" on a member's own fiche.
/// </summary>
[Authorize]
[Route("api/v1/siblings")]
public class SiblingsController : BaseApiController
{
    public record MemberIdsRequest(IReadOnlyList<Guid> MemberIds);
    public record LinkRequest(Guid MemberId, Guid TargetMemberId);

    /// <summary>Suggested sibling families (matching engine) awaiting review. Requires maitrise.manage.</summary>
    [HttpGet("suggestions")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Suggestions()
        => Ok(await Mediator.Send(new GetSiblingSuggestionsQuery()));

    /// <summary>Confirmed fratries, optionally filtered by member name. Requires maitrise.manage.</summary>
    [HttpGet("groups")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Groups([FromQuery] string? search)
        => Ok(await Mediator.Send(new GetSiblingGroupsQuery(search)));

    /// <summary>Full family data (parents by role + addresses) for the reconcile dialog. Requires maitrise.manage.</summary>
    [HttpPost("reconcile-data")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> ReconcileData([FromBody] MemberIdsRequest req)
        => Ok(await Mediator.Send(new GetSiblingReconcileDataQuery(req.MemberIds)));

    /// <summary>Approve a family: create/merge the group + reconcile parents/address/contacts. Requires maitrise.manage.</summary>
    [HttpPost("approve")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Approve([FromBody] ApproveSiblingGroupCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { groupId = result.Value });
    }

    /// <summary>Reject a suggested family (tombstone the pairs so they're not re-suggested). Requires maitrise.manage.</summary>
    [HttpPost("reject")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Reject([FromBody] MemberIdsRequest req)
    {
        var result = await Mediator.Send(new RejectSiblingSuggestionCommand(req.MemberIds));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Manually link two members as siblings (merging groups if needed). Requires maitrise.manage.</summary>
    [HttpPost("link")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Link([FromBody] LinkRequest req)
    {
        var result = await Mediator.Send(new LinkSiblingsCommand(req.MemberId, req.TargetMemberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { groupId = result.Value });
    }

    /// <summary>Remove a member from its fratrie (dissolving the group if fewer than 2 remain). Requires maitrise.manage.</summary>
    [HttpPost("unlink")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Unlink([FromBody] MemberIdsRequest req)
    {
        // Single member id expected in the list (reuse the shared request shape).
        var memberId = req.MemberIds.FirstOrDefault();
        var result = await Mediator.Send(new UnlinkSiblingCommand(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>A member's confirmed siblings — powers the fiche "Frères et sœurs". Gated by member access.</summary>
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> Member(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberSiblingsQuery(memberId));
        if (!result.IsSuccess) return StatusCode(403, new { error = result.Error });
        return Ok(result.Value);
    }
}
