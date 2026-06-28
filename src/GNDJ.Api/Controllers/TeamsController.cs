using GNDJ.Api.Authorization;
using GNDJ.Application.Teams.Commands.CreateTeam;
using GNDJ.Application.Teams.Commands.DeleteTeam;
using GNDJ.Application.Teams.Commands.UpdateTeam;
using GNDJ.Application.Teams.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Teams (sizaines/équipes within a unit) CRUD. Base route api/v1/teams. Requires authentication (JWT or API key).
/// View via teams.view; writes split across teams.create / teams.edit / teams.delete.
/// </summary>
[Authorize]
public class TeamsController : BaseApiController
{
    /// <summary>Lists teams (paged), optionally filtered by unit and search term. Requires teams.view.</summary>
    /// <param name="unitId">Scopes teams to one unit (used by the cascading unit-then-team dropdowns).</param>
    /// <param name="search">Filters teams by name.</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Number of items per page.</param>
    [HttpGet]
    [HasPermission(Permissions.TeamsView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitId, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetTeamsQuery(unitId, search, page, pageSize));
        return Ok(result);
    }

    /// <summary>Creates a team. Requires teams.create.</summary>
    /// <response code="201">Team created; returns its id.</response>
    [HttpPost]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.TeamsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateTeamCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/teams/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a team. Requires teams.edit.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.TeamsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTeamCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a team. Requires teams.delete.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.TeamsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteTeamCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
