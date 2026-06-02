using GNDJ.Api.Authorization;
using GNDJ.Application.Units.Commands.CreateUnit;
using GNDJ.Application.Units.Commands.DeleteUnit;
using GNDJ.Application.Units.Commands.UpdateUnit;
using GNDJ.Application.Units.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
public class UnitsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.UnitsView)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] Guid? associationId,
        [FromQuery] Guid? unitTypeId,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetUnitsQuery(search, associationId, unitTypeId, isActive, page, pageSize));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.UnitsView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetUnitByIdQuery(id));
        if (result is null) return NotFound(new { error = "Unité introuvable." });
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.UnitsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateUnitCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/units/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.UnitsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUnitCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.UnitsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteUnitCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
