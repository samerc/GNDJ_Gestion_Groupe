using GNDJ.Api.Authorization;
using GNDJ.Application.Associations.Commands.CreateAssociation;
using GNDJ.Application.Associations.Commands.DeleteAssociation;
using GNDJ.Application.Associations.Commands.UpdateAssociation;
using GNDJ.Application.Associations.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Scout associations CRUD. Base route api/v1/associations. Requires JWT or API-key auth; reads require
/// associations.view, writes require associations.manage.
/// </summary>
[Authorize]
public class AssociationsController : BaseApiController
{
    /// <summary>Lists associations with optional search and pagination. Requires associations.view.</summary>
    [HttpGet]
    [HasPermission(Permissions.AssociationsView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetAssociationsQuery(search, page, pageSize));
        return Ok(result);
    }

    /// <summary>Gets one association by id. Requires associations.view.</summary>
    /// <response code="404">No association with that id.</response>
    [ProducesResponseType(404)]
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.AssociationsView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetAssociationByIdQuery(id));
        if (result is null) return NotFound(new { error = "Association introuvable." });
        return Ok(result);
    }

    /// <summary>Creates an association. Requires associations.manage.</summary>
    [ProducesResponseType(201)]
    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateAssociationCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/associations/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates an association. Requires associations.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssociationCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes an association. Requires associations.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteAssociationCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
