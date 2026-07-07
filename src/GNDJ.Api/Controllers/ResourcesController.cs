using GNDJ.Api.Authorization;
using GNDJ.Application.Resources;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin CMS for the public heritage/knowledge library (Ressources). Route api/v1/resources.
/// All actions require the content.manage permission (the public library lives on PublicController).
/// </summary>
[Authorize]
[Route("api/v1/resources")]
public class ResourcesController : BaseApiController
{
    /// <summary>Lists all resources for the admin (published and drafts, by category). Requires content.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetAll()
        => Ok(await Mediator.Send(new GetResourcesAdminQuery()));

    /// <summary>Gets a single resource by id for editing. Requires content.manage.</summary>
    /// <response code="404">No resource with this id.</response>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetResourceByIdQuery(id));
        if (result is null) return NotFound(new { error = "Ressource introuvable." });
        return Ok(result);
    }

    /// <summary>Creates a resource (auto-slug from title, auto-excerpt from body). Requires content.manage.</summary>
    /// <response code="201">Resource created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateResourceCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/resources/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a resource. Requires content.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateResourceCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a resource. Requires content.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteResourceCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
