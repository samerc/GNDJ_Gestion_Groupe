using GNDJ.Api.Authorization;
using GNDJ.Application.UnitTypeProgressions;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/unit-type-progressions")]
public class UnitTypeProgressionsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.UnitTypesView)]
    public async Task<IActionResult> Get([FromQuery] Guid? associationId)
    {
        // Paths are group-wide now; associationId is optional (kept for compatibility).
        var result = await Mediator.Send(new GetUnitTypeProgressionsQuery(associationId == Guid.Empty ? null : associationId));
        return Ok(result);
    }

    [HttpGet("suggest/{memberId:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> GetSuggestion(Guid memberId)
    {
        var result = await Mediator.Send(new GetPassageSuggestionQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    // All allowed passage destinations (current branch + parcours-scout targets) for the propose dialog.
    [HttpGet("destinations/{memberId:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> GetDestinations(Guid memberId)
    {
        var result = await Mediator.Send(new GetPassageDestinationsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Create([FromBody] CreateUnitTypeProgressionCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/unit-type-progressions/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUnitTypeProgressionCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteUnitTypeProgressionCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
