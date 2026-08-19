using GNDJ.Api.Authorization;
using GNDJ.Application.ChangeRequests;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Member-proposed changes needing approval (progression + fonctions). Base route api/v1/change-requests.
/// Members PROPOSE for their own record (auth-only; the server uses their own member id) and list their own
/// requests; CU/CG list the pending requests for members they manage and review them (approve applies the
/// change, reject discards it). Review is gated on members.edit; the read/count handlers also self-gate.
/// </summary>
[Authorize]
[Route("api/v1/change-requests")]
public class ChangeRequestsController : BaseApiController
{
    /// <summary>Member proposes a progression entry for their own record (Pending until reviewed).</summary>
    [HttpPost("progression")]
    public async Task<IActionResult> ProposeProgression([FromBody] ProposeProgressionCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });
    }

    /// <summary>Member proposes a fonction (unit + team + role) for their own record (Pending until reviewed).</summary>
    [HttpPost("assignment")]
    public async Task<IActionResult> ProposeAssignment([FromBody] ProposeAssignmentCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });
    }

    /// <summary>The caller's own change requests (all statuses).</summary>
    [HttpGet("mine")]
    public async Task<IActionResult> Mine() => Ok(await Mediator.Send(new GetMyChangeRequestsQuery()));

    /// <summary>Member dismisses/withdraws one of their OWN requests (clears a rejected notice or a pending proposal).</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Dismiss(Guid id)
    {
        var result = await Mediator.Send(new DismissChangeRequestCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>All active units a member may target when proposing a fonction (not unit-scoped).</summary>
    [HttpGet("units")]
    public async Task<IActionResult> ProposableUnits() => Ok(await Mediator.Send(new GetProposableUnitsQuery()));

    /// <summary>Pending change requests for members the caller manages (CU/CG). Empty for non-leaders.</summary>
    [HttpGet("pending")]
    public async Task<IActionResult> Pending() => Ok(await Mediator.Send(new GetPendingChangeRequestsQuery()));

    /// <summary>Pending count for the sidebar badge (same scoping as the list).</summary>
    [HttpGet("pending/count")]
    public async Task<IActionResult> PendingCount() => Ok(new { count = await Mediator.Send(new GetPendingChangeRequestsCountQuery()) });

    /// <summary>Approve (apply the change) or reject (discard with a reason) a change request. Requires members.edit.</summary>
    [HttpPost("{id:guid}/review")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewChangeRequestCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
