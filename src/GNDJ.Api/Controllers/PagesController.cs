using GNDJ.Api.Authorization;
using GNDJ.Application.Pages;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin CMS for static content pages (Le Groupe / À propos…). Route api/v1/pages. Auth is JWT or API-key.
/// Pages support a one-level parent/child hierarchy and a draggable display order; all actions require content.manage.
/// </summary>
[Authorize]
[Route("api/v1/pages")]
public class PagesController : BaseApiController
{
    /// <summary>Lists all content pages for the admin (the nested tree). Requires content.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetAll()
        => Ok(await Mediator.Send(new GetPagesAdminQuery()));

    /// <summary>Gets a single content page by id for editing. Requires content.manage.</summary>
    /// <response code="404">No page with this id.</response>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetPageByIdQuery(id));
        if (result is null) return NotFound(new { error = "Page introuvable." });
        return Ok(result);
    }

    /// <summary>Creates a content page (auto-slug from title). Requires content.manage.</summary>
    /// <response code="201">Page created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreatePageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/pages/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a content page. Requires content.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a content page. Requires content.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeletePageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Reorders pages within their parent (drag-and-drop display order). Requires content.manage.</summary>
    [HttpPut("reorder")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderPagesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
