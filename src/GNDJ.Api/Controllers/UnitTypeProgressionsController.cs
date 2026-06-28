using GNDJ.Api.Authorization;
using GNDJ.Application.UnitTypeProgressions;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Parcours scouts: the group-wide path between unit types (drives passage suggestions).
/// Base route api/v1/unit-type-progressions. Requires authentication (JWT or API key).
/// Read needs unit_types.view, mutate needs unit_types.manage; the suggest and destinations
/// endpoints feed the passage propose dialog and instead require passage.propose.
/// </summary>
[Authorize]
[Route("api/v1/unit-type-progressions")]
public class UnitTypeProgressionsController : BaseApiController
{
    /// <summary>Lists progression paths. Requires unit_types.view.</summary>
    /// <param name="associationId">Optional; paths are group-wide now, kept for backward compatibility.</param>
    [HttpGet]
    [HasPermission(Permissions.UnitTypesView)]
    public async Task<IActionResult> Get([FromQuery] Guid? associationId)
    {
        // Paths are group-wide now; associationId is optional (kept for compatibility).
        var result = await Mediator.Send(new GetUnitTypeProgressionsQuery(associationId == Guid.Empty ? null : associationId));
        return Ok(result);
    }

    /// <summary>Suggests the passage destination for a member based on the parcours. Requires passage.propose.</summary>
    [HttpGet("suggest/{memberId:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> GetSuggestion(Guid memberId)
    {
        var result = await Mediator.Send(new GetPassageSuggestionQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// Returns all allowed passage destinations (current branch + parcours-scout targets) for the propose dialog.
    /// Requires passage.propose.
    /// </summary>
    [HttpGet("destinations/{memberId:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> GetDestinations(Guid memberId)
    {
        var result = await Mediator.Send(new GetPassageDestinationsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Creates a progression path. Requires unit_types.manage.</summary>
    /// <response code="201">Path created; returns its id.</response>
    [HttpPost]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Create([FromBody] CreateUnitTypeProgressionCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/unit-type-progressions/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a progression path. Requires unit_types.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUnitTypeProgressionCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a progression path. Requires unit_types.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteUnitTypeProgressionCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
