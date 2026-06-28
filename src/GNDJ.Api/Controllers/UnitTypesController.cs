using GNDJ.Api.Authorization;
using GNDJ.Application.UnitTypes.Commands.CreateUnitType;
using GNDJ.Application.UnitTypes.Commands.DeleteUnitType;
using GNDJ.Application.UnitTypes.Commands.UpdateUnitType;
using GNDJ.Application.UnitTypes.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Unit types (Meute/Troupe/...) CRUD. Base route api/v1/unit-types. Requires authentication (JWT or API key).
/// View gated by unit_types.view; writes by unit_types.manage.
/// </summary>
[Authorize]
[Route("api/v1/unit-types")]
public class UnitTypesController : BaseApiController
{
    /// <summary>Lists unit types (paged), optionally filtered by search term. Requires unit_types.view.</summary>
    [HttpGet]
    [HasPermission(Permissions.UnitTypesView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetUnitTypesQuery(search, page, pageSize));
        return Ok(result);
    }

    /// <summary>Gets a single unit type by id. Requires unit_types.view.</summary>
    /// <response code="404">No unit type exists for the given id.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(404)]
    [HasPermission(Permissions.UnitTypesView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetUnitTypeByIdQuery(id));
        if (result is null) return NotFound(new { error = "Type d'unité introuvable." });
        return Ok(result);
    }

    /// <summary>Creates a unit type. Requires unit_types.manage.</summary>
    /// <response code="201">Unit type created; returns its id.</response>
    [HttpPost]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Create([FromBody] CreateUnitTypeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/unit-types/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a unit type. Requires unit_types.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUnitTypeCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a unit type. Requires unit_types.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.UnitTypesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteUnitTypeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
