using GNDJ.Api.Authorization;
using GNDJ.Application.Teams.Commands.CreateTeam;
using GNDJ.Application.Teams.Commands.DeleteTeam;
using GNDJ.Application.Teams.Commands.UpdateTeam;
using GNDJ.Application.Teams.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Teams (sizaines/équipes within a unit) CRUD — base route api/v1/teams.
// [Authorize] = JWT or API-key required; view via TeamsView, writes split across TeamsCreate/Edit/Delete.
[Authorize]
public class TeamsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.TeamsView)]
    // unitId filter scopes teams to one unit (used by the cascading unit→team dropdowns).
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitId, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetTeamsQuery(unitId, search, page, pageSize));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.TeamsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateTeamCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/teams/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.TeamsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTeamCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.TeamsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteTeamCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
