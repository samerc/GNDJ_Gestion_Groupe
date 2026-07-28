using GNDJ.Application.Events;
using GNDJ.Application.News;
using GNDJ.Application.Pages;
using GNDJ.Application.Resources;
using GNDJ.Application.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Public group website API (base route <c>api/v1/public</c>). ALL endpoints are ANONYMOUS and return only
/// public-safe data (no member PII). Read endpoints are output-cached briefly; the contact-form write endpoint
/// is rate-limited via the "forms" policy.
/// </summary>
[Route("api/v1/public")]
[AllowAnonymous]
public class PublicController : BaseApiController
{
    /// <summary>Returns the public site configuration (texts, whether inscriptions are open, contact info).</summary>
    [HttpGet("site-config")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> SiteConfig()
        => Ok(await Mediator.Send(new GetPublicSiteConfigQuery()));

    /// <summary>Maintenance/kill-switch status so each frontend can show a "Sous maintenance" page. Not cached (toggles must reflect quickly; the provider caches ~15s server-side).</summary>
    [HttpGet("maintenance")]
    public async Task<IActionResult> Maintenance()
        => Ok(await Mediator.Send(new GetMaintenanceStatusQuery()));

    /// <summary>Lists the published units grouped by branch, with category descriptions.</summary>
    [HttpGet("units")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Units()
        => Ok(await Mediator.Send(new GetPublicUnitsQuery()));

    /// <summary>Returns one published unit's public detail (maîtrise, teams, youth counts, founding year).</summary>
    /// <response code="404">No published unit matches the slug.</response>
    [ProducesResponseType(404)]
    [HttpGet("units/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> UnitDetail(string slug)
    {
        var result = await Mediator.Send(new GetPublicUnitDetailQuery(slug));
        if (result is null) return NotFound(new { error = "Unité introuvable." });
        return Ok(result);
    }

    /// <summary>Returns a paged list of published news posts (excerpt + tag).</summary>
    [HttpGet("news")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> News([FromQuery] int page = 1, [FromQuery] int pageSize = 12,
        [FromQuery] bool groupOnly = false, [FromQuery] Guid? unitTypeId = null)
        => Ok(await Mediator.Send(new GetPublicNewsQuery(page, pageSize, groupOnly, unitTypeId)));

    /// <summary>Returns one published news article by slug.</summary>
    /// <response code="404">No published article matches the slug.</response>
    [ProducesResponseType(404)]
    [HttpGet("news/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> NewsArticle(string slug)
    {
        var result = await Mediator.Send(new GetPublicNewsArticleQuery(slug));
        if (result is null) return NotFound(new { error = "Article introuvable." });
        return Ok(result);
    }

    /// <summary>Returns a paged list of upcoming published events (soonest first).</summary>
    [HttpGet("events")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Events([FromQuery] int page = 1, [FromQuery] int pageSize = 24,
        [FromQuery] bool groupOnly = false, [FromQuery] Guid? unitTypeId = null)
        => Ok(await Mediator.Send(new GetPublicEventsQuery(page, pageSize, groupOnly, unitTypeId)));

    /// <summary>Returns one published event by slug.</summary>
    /// <response code="404">No published event matches the slug.</response>
    [ProducesResponseType(404)]
    [HttpGet("events/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Event(string slug)
    {
        var result = await Mediator.Send(new GetPublicEventBySlugQuery(slug));
        if (result is null) return NotFound(new { error = "Événement introuvable." });
        return Ok(result);
    }

    /// <summary>Returns a paged list of published heritage resources (optional category + search).</summary>
    [HttpGet("resources")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Resources([FromQuery] string? category = null, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 24)
        => Ok(await Mediator.Send(new GetPublicResourcesQuery(category, search, page, pageSize)));

    /// <summary>Returns one published resource by slug.</summary>
    /// <response code="404">No published resource matches the slug.</response>
    [ProducesResponseType(404)]
    [HttpGet("resources/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Resource(string slug)
    {
        var result = await Mediator.Send(new GetPublicResourceBySlugQuery(slug));
        if (result is null) return NotFound(new { error = "Ressource introuvable." });
        return Ok(result);
    }

    /// <summary>Lists the published standalone CMS pages (for navigation).</summary>
    [HttpGet("pages")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Pages()
        => Ok(await Mediator.Send(new GetPublicPagesQuery()));

    /// <summary>Returns one published standalone CMS page by slug.</summary>
    /// <response code="404">No published page matches the slug.</response>
    [ProducesResponseType(404)]
    [HttpGet("pages/{slug}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> Page(string slug)
    {
        var result = await Mediator.Send(new GetPublicPageQuery(slug));
        if (result is null) return NotFound(new { error = "Page introuvable." });
        return Ok(result);
    }

    /// <summary>Submits the public contact form (rate-limited, honeypot-protected); emails the configured recipient.</summary>
    [HttpPost("contact")]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> Contact([FromBody] SendContactMessageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Votre message a bien été envoyé." });
    }
}
