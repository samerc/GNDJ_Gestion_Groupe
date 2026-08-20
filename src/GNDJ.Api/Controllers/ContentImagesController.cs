using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Image upload and serving for CMS content (news/pages rich text). Base route api/v1/content/images. Upload
/// requires content.manage; serving is anonymous (images are public). Files are magic-byte validated and
/// path-traversal guarded.
/// </summary>
[Route("api/v1/content/images")]
public class ContentImagesController : BaseApiController
{
    private static readonly string[] Allowed = { "jpg", "jpeg", "png", "webp", "gif" };

    /// <summary>
    /// Uploads a content image (JPG, PNG, WEBP or GIF, max 5 MB, magic-byte validated) and returns its public URL.
    /// Requires content.manage. Rate-limited.
    /// </summary>
    [HttpPost]
    [Authorize]
    [HasPermission(Permissions.ContentManage)]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5MB
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Aucun fichier." });
        if (file.Length > 5 * 1024 * 1024) return BadRequest(new { error = "Fichier trop volumineux (max 5 Mo)." });

        var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLowerInvariant();
        if (!Allowed.Contains(ext)) return BadRequest(new { error = "Format non autorisé (JPG, PNG, WEBP, GIF)." });

        var header = new byte[12];
        await using (var s = file.OpenReadStream())
        {
            var read = await s.ReadAsync(header.AsMemory(0, 12));
            var ok = ext switch
            {
                "jpg" or "jpeg" => read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
                "png" => read >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47,
                "gif" => read >= 3 && header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46, // GIF
                "webp" => read >= 12 && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46
                          && header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50, // RIFF....WEBP
                _ => false,
            };
            if (!ok) return BadRequest(new { error = "Le contenu du fichier ne correspond pas à une image valide." });
        }

        var dir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "content");
        Directory.CreateDirectory(dir);
        var fileName = $"{Guid.CreateVersion7()}.{ext}";
        var path = Path.Combine(dir, fileName);
        await using (var fs = System.IO.File.Create(path))
            await file.CopyToAsync(fs);

        return Ok(new { url = $"/api/v1/content/images/{fileName}" });
    }

    /// <summary>Serves a previously uploaded content image by file name. Anonymous.</summary>
    /// <response code="404">No image with that file name.</response>
    [ProducesResponseType(404)]
    [HttpGet("{fileName}")]
    [AllowAnonymous]
    public IActionResult Get(string fileName)
    {
        var safe = Path.GetFileName(fileName); // strip any path components
        var root = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads", "content"));
        var full = Path.GetFullPath(Path.Combine(root, safe));
        if (!full.StartsWith(root) || !System.IO.File.Exists(full)) return NotFound();

        var ext = Path.GetExtension(full).TrimStart('.').ToLowerInvariant();
        var contentType = ext switch
        {
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        // File names are content-addressed GUIDs (never re-used), so the bytes for a given URL never change —
        // let the browser + Cloudflare edge cache them for a year instead of re-fetching on every page view.
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return PhysicalFile(full, contentType);
    }
}
