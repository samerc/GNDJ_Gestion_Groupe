using GNDJ.Api.Authorization;
using GNDJ.Application.Associations.Commands.CreateAssociation;
using GNDJ.Application.Associations.Commands.DeleteAssociation;
using GNDJ.Application.Associations.Commands.UpdateAssociation;
using GNDJ.Application.Associations.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
public class AssociationsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AssociationsView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetAssociationsQuery(search, page, pageSize));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.AssociationsView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetAssociationByIdQuery(id));
        if (result is null) return NotFound(new { error = "Association introuvable." });
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateAssociationCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/associations/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssociationCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteAssociationCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
