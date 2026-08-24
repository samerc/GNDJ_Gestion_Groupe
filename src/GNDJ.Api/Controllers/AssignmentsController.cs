using GNDJ.Api.Authorization;
using GNDJ.Application.Assignments.Commands.CreateAssignment;
using GNDJ.Application.Assignments.Commands.CorrectMemberUnit;
using GNDJ.Application.Assignments.Commands.DeleteAssignment;
using GNDJ.Application.Assignments.Commands.EndAssignment;
using GNDJ.Application.Assignments.Commands.UpdateAssignment;
using GNDJ.Application.Assignments.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Member assignments (member linked to a unit/team/role over a date range). Base route api/v1/assignments.
/// Requires JWT or API-key auth; reads require assignments.view, writes split across
/// assignments.create / assignments.edit / assignments.delete.
/// </summary>
[Authorize]
public class AssignmentsController : BaseApiController
{
    /// <summary>Lists assignments with optional filters and pagination. Requires assignments.view.</summary>
    /// <param name="memberId">Filter to a single member.</param>
    /// <param name="unitId">Filter to a single unit.</param>
    /// <param name="teamId">Filter to a single team.</param>
    /// <param name="isActive">When set, filters to active (true) or ended (false) assignments.</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Page size.</param>
    [HttpGet]
    [HasPermission(Permissions.AssignmentsView)]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? memberId, [FromQuery] Guid? unitId, [FromQuery] Guid? teamId,
        [FromQuery] bool? isActive, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetAssignmentsQuery(memberId, unitId, teamId, isActive, page, pageSize));
        return Ok(result);
    }

    /// <summary>Creates an assignment. Requires assignments.create.</summary>
    [ProducesResponseType(201)]
    [HttpPost]
    [HasPermission(Permissions.AssignmentsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateAssignmentCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/assignments/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates an assignment. Requires assignments.edit.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssignmentsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssignmentCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Sets an assignment's end date ("Terminer aujourd'hui") without a full edit. Requires assignments.edit.</summary>
    [HttpPut("{id:guid}/end")]
    [HasPermission(Permissions.AssignmentsEdit)]
    public async Task<IActionResult> End(Guid id, [FromBody] EndAssignmentCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>
    /// Corrects a WRONG placement: repoints the active assignment to the right unit IN PLACE (team reset,
    /// role kept or defaulted, start date kept) so the wrong unit leaves no trace. CG/super-admin only
    /// (requires maitrise.manage).
    /// </summary>
    [HttpPut("{id:guid}/correct-unit")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> CorrectUnit(Guid id, [FromBody] CorrectUnitRequest body)
    {
        var result = await Mediator.Send(new CorrectMemberUnitCommand(id, body.NewUnitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    public record CorrectUnitRequest(Guid NewUnitId);

    /// <summary>Deletes an assignment. Requires assignments.delete.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssignmentsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteAssignmentCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
