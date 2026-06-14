using GNDJ.Application.News;
using GNDJ.Application.Pages;
using GNDJ.Application.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

// Public group website API. All endpoints are anonymous and return ONLY public-safe data
// (no member PII). Read endpoints are output-cached briefly; write endpoints (contact form, later)
// are rate-limited via the "forms" policy.
[Route("api/v1/public")]
[AllowAnonymous]
public class PublicController : BaseApiController
{
    [HttpGet("site-config")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> SiteConfig()
        => Ok(await Mediator.Send(new GetPublicSiteConfigQuery()));

    [HttpGet("units")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Units()
        => Ok(await Mediator.Send(new GetPublicUnitsQuery()));

    [HttpGet("units/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> UnitDetail(string slug)
    {
        var result = await Mediator.Send(new GetPublicUnitDetailQuery(slug));
        if (result is null) return NotFound(new { error = "Unité introuvable." });
        return Ok(result);
    }

    [HttpGet("news")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> News([FromQuery] int page = 1, [FromQuery] int pageSize = 12)
        => Ok(await Mediator.Send(new GetPublicNewsQuery(page, pageSize)));

    [HttpGet("news/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> NewsArticle(string slug)
    {
        var result = await Mediator.Send(new GetPublicNewsArticleQuery(slug));
        if (result is null) return NotFound(new { error = "Article introuvable." });
        return Ok(result);
    }

    [HttpGet("pages")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Pages()
        => Ok(await Mediator.Send(new GetPublicPagesQuery()));

    [HttpGet("pages/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Page(string slug)
    {
        var result = await Mediator.Send(new GetPublicPageQuery(slug));
        if (result is null) return NotFound(new { error = "Page introuvable." });
        return Ok(result);
    }

    [HttpPost("contact")]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> Contact([FromBody] SendContactMessageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Votre message a bien été envoyé." });
    }
}
