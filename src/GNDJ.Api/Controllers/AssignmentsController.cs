using GNDJ.Api.Authorization;
using GNDJ.Application.Assignments.Commands.CreateAssignment;
using GNDJ.Application.Assignments.Commands.DeleteAssignment;
using GNDJ.Application.Assignments.Commands.EndAssignment;
using GNDJ.Application.Assignments.Commands.UpdateAssignment;
using GNDJ.Application.Assignments.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Member assignments (member ↔ unit/team/role over a date range) — base route api/v1/assignments.
// [Authorize] = JWT or API-key required; view via AssignmentsView, writes split across AssignmentsCreate/Edit/Delete.
[Authorize]
public class AssignmentsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AssignmentsView)]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? memberId, [FromQuery] Guid? unitId, [FromQuery] Guid? teamId,
        [FromQuery] bool? isActive, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetAssignmentsQuery(memberId, unitId, teamId, isActive, page, pageSize));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.AssignmentsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateAssignmentCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/assignments/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssignmentsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssignmentCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // Sub-route /{id}/end — sets the assignment's end date ("Terminer aujourd'hui") rather than full edit/delete.
    [HttpPut("{id:guid}/end")]
    [HasPermission(Permissions.AssignmentsEdit)]
    public async Task<IActionResult> End(Guid id, [FromBody] EndAssignmentCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssignmentsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteAssignmentCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
