using GNDJ.Api.Authorization;
using GNDJ.Application.Organization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// "Organiser mon unité" — the CU roster board. Base route api/v1/organization. Requires members.edit; the
/// handlers re-check that the caller leads the specific unit (super-admin / CG / ACG reach any unit).
/// </summary>
[Authorize]
public class OrganizationController : BaseApiController
{
    /// <summary>Returns everything the board needs for a unit: teams, fonctions, and active members with their placement. Requires members.edit + leadership of the unit.</summary>
    [HttpGet("unit/{unitId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> GetUnit(Guid unitId)
    {
        var result = await Mediator.Send(new GetUnitOrganizationQuery(unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Moves a member (team + fonction) by editing their existing active assignment in place. Requires members.edit + leadership of the unit.</summary>
    [HttpPut("placement/{assignmentId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> SetPlacement(Guid assignmentId, [FromBody] SetPlacementRequest body)
    {
        var result = await Mediator.Send(new SetAssignmentPlacementCommand(assignmentId, body.TeamId, body.FunctionalRoleId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // Body for SetPlacement — the assignment id comes from the route.
    public record SetPlacementRequest(Guid? TeamId, Guid FunctionalRoleId);
}
