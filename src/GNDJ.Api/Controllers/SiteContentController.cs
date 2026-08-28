using GNDJ.Api.Authorization;
using GNDJ.Application.Public;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin editor for the public site's built-in texts (home, footer, contact), base route <c>api/v1/site-content</c>.
/// Although the site itself is anonymous, these admin endpoints require authentication and the content.manage permission.
/// </summary>
[Authorize]
[Route("api/v1/site-content")]
public class SiteContentController : BaseApiController
{
    /// <summary>Returns the editable site texts. Requires content.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Get()
        => Ok(await Mediator.Send(new GetSiteContentQuery()));

    /// <summary>Updates the editable site texts. Requires content.manage.</summary>
    [HttpPut]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update([FromBody] UpdateSiteContentCommand command, [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        // Evict the public read cache so the edit (hero photo, texts, footer…) shows on the public site
        // immediately instead of after the 2-min ShortCache TTL. /public/* endpoints are tagged "short".
        await outputCache.EvictByTagAsync("short", default);
        return NoContent();
    }
}
