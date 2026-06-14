using GNDJ.Api.Authorization;
using GNDJ.Application.Public;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Admin editor for the public site's built-in texts (home, footer, contact). Requires content.manage.
[Authorize]
[Route("api/v1/site-content")]
public class SiteContentController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Get()
        => Ok(await Mediator.Send(new GetSiteContentQuery()));

    [HttpPut]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update([FromBody] UpdateSiteContentCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
