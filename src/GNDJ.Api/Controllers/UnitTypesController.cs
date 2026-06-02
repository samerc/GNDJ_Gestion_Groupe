using GNDJ.Api.Authorization;
using GNDJ.Application.UnitTypes.Commands.CreateUnitType;
using GNDJ.Application.UnitTypes.Commands.DeleteUnitType;
using GNDJ.Application.UnitTypes.Commands.UpdateUnitType;
using GNDJ.Application.UnitTypes.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/unit-types")]
public class UnitTypesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.UnitTypesView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetUnitTypesQuery(search, page, pageSize));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.UnitTypesView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetUnitTypeByIdQuery(id));
        if (result is null) return NotFound(new { error = "Type d'unité introuvable." });
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Create([FromBody] CreateUnitTypeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/unit-types/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUnitTypeCommand command)
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
        var result = await Mediator.Send(new DeleteUnitTypeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
