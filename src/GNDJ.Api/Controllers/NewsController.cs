using GNDJ.Api.Authorization;
using GNDJ.Application.News;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Admin CMS for news articles (Actualités). All actions require the content.manage permission.
[Authorize]
[Route("api/v1/news")]
public class NewsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetAll()
        => Ok(await Mediator.Send(new GetNewsPostsAdminQuery()));

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetNewsPostByIdQuery(id));
        if (result is null) return NotFound(new { error = "Article introuvable." });
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Create([FromBody] CreateNewsPostCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/news/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateNewsPostCommand command)
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
        var result = await Mediator.Send(new DeleteNewsPostCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
