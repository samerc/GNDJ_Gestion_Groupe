using GNDJ.Api.Authorization;
using GNDJ.Application.Pages;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Admin CMS for static content pages (Le Groupe / À propos…). Requires content.manage.
[Authorize]
[Route("api/v1/pages")]
public class PagesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetAll()
        => Ok(await Mediator.Send(new GetPagesAdminQuery()));

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetPageByIdQuery(id));
        if (result is null) return NotFound(new { error = "Page introuvable." });
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Create([FromBody] CreatePageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/pages/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeletePageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPut("reorder")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderPagesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
