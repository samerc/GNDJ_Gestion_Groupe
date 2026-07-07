using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// File (attachment) upload + serving for CMS content — e.g. PDFs attached to news articles. Base route
/// api/v1/content/files. Upload requires content.manage; serving is anonymous (attachments are public).
/// Files are magic-byte validated (PDF + images) and path-traversal guarded — the same hardening as the
/// content-image endpoint, just with PDF allowed and a larger size cap.
/// </summary>
[Route("api/v1/content/files")]
public class ContentFilesController : BaseApiController
{
    private static readonly string[] Allowed = { "pdf", "jpg", "jpeg", "png", "webp", "gif", "mp3" };

    /// <summary>
    /// Uploads a content attachment (PDF or image, max 15 MB, magic-byte validated) and returns its public
    /// URL + the original file name + size. Requires content.manage. Rate-limited.
    /// </summary>
    [HttpPost]
    [Authorize]
    [HasPermission(Permissions.ContentManage)]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(15 * 1024 * 1024)] // 15MB
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Aucun fichier." });
        if (file.Length > 15 * 1024 * 1024) return BadRequest(new { error = "Fichier trop volumineux (max 15 Mo)." });

        var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLowerInvariant();
        if (!Allowed.Contains(ext)) return BadRequest(new { error = "Format non autorisé (PDF, JPG, PNG, WEBP, GIF, MP3)." });

        var header = new byte[12];
        await using (var s = file.OpenReadStream())
        {
            var read = await s.ReadAsync(header.AsMemory(0, 12));
            var ok = ext switch
            {
                "pdf" => read >= 4 && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46, // %PDF
                "jpg" or "jpeg" => read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
                "png" => read >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47,
                "gif" => read >= 3 && header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46,
                "webp" => read >= 12 && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46
                          && header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50,
                // MP3: "ID3" tag OR an MPEG audio frame sync (0xFF followed by 0b111xxxxx).
                "mp3" => read >= 3 && ((header[0] == 0x49 && header[1] == 0x44 && header[2] == 0x33)
                          || (header[0] == 0xFF && (header[1] & 0xE0) == 0xE0)),
                _ => false,
            };
            if (!ok) return BadRequest(new { error = "Le contenu du fichier ne correspond pas à son extension." });
        }

        var dir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "content");
        Directory.CreateDirectory(dir);
        var fileName = $"{Guid.CreateVersion7()}.{ext}";
        var path = Path.Combine(dir, fileName);
        await using (var fs = System.IO.File.Create(path))
            await file.CopyToAsync(fs);

        // name = the original file name (sanitized) — shown to the public as the attachment label + download name.
        return Ok(new { url = $"/api/v1/content/files/{fileName}", name = Path.GetFileName(file.FileName), size = file.Length });
    }

    /// <summary>Serves a previously uploaded content file by file name. Anonymous.</summary>
    /// <response code="404">No file with that name.</response>
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
            "pdf" => "application/pdf",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "mp3" => "audio/mpeg",
            _ => "image/jpeg",
        };
        return PhysicalFile(full, contentType);
    }
}
