using GNDJ.Api.Authorization;
using GNDJ.Application.News;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin CMS for news articles (Actualités). Route api/v1/news. Auth is JWT or API-key.
/// All actions require the content.manage permission (the public-facing list/article live on PublicController).
/// </summary>
[Authorize]
[Route("api/v1/news")]
public class NewsController : BaseApiController
{
    /// <summary>Lists all news articles for the admin (published and drafts). Requires content.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetAll()
        => Ok(await Mediator.Send(new GetNewsPostsAdminQuery()));

    /// <summary>Gets a single news article by id for editing. Requires content.manage.</summary>
    /// <response code="404">No article with this id.</response>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetNewsPostByIdQuery(id));
        if (result is null) return NotFound(new { error = "Article introuvable." });
        return Ok(result);
    }

    /// <summary>Creates a news article (auto-slug from title, auto-excerpt from body). Requires content.manage.</summary>
    /// <response code="201">Article created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateNewsPostCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/news/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a news article. Requires content.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateNewsPostCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a news article. Requires content.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteNewsPostCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
