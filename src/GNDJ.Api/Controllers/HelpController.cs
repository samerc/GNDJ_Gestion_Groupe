using GNDJ.Api.Help;
using GNDJ.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>The in-app "Aide" guides. Anonymous callers see only the public guide (family enrolment); signed-in
/// members see the guides of their role (member → CU → CG → super-admin incl. the technical documentation).
/// Access is decided per guide on the server (see HelpDocs).</summary>
[AllowAnonymous]
[Route("api/v1/help")]
public class HelpController(HelpDocs docs, ICurrentUserService currentUser) : BaseApiController
{
    /// <summary>The guides the caller may read, with their section titles.</summary>
    [HttpGet]
    public IActionResult List() => Ok(docs.List(currentUser));

    /// <summary>One guide's Markdown. 404 when it doesn't exist or the caller may not read it.</summary>
    [HttpGet("{slug}")]
    public IActionResult Get(string slug) => docs.Get(slug, currentUser) is { } d ? Ok(d) : NotFound();

    /// <summary>Accent-insensitive search in the guides the caller may read (one hit per section).</summary>
    [HttpGet("search")]
    public IActionResult Search([FromQuery] string q) => Ok(docs.Search(q ?? "", currentUser));

    /// <summary>A screenshot/diagram used by the guides. Anonymous: only images of the public guide.</summary>
    [HttpGet("img/{file}")]
    public IActionResult Image(string file)
    {
        var path = docs.ImagePath(file, User.Identity?.IsAuthenticated == true);
        if (path is null) return NotFound();
        var type = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "application/octet-stream",
        };
        Response.Headers.CacheControl = "private, max-age=3600";
        return PhysicalFile(path, type);
    }
}
