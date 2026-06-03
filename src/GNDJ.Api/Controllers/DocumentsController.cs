using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Documents;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/documents")]
public class DocumentsController : BaseApiController
{
    private readonly IApplicationDbContext _context;

    public DocumentsController(IApplicationDbContext context)
    {
        _context = context;
    }

    // No permission attribute — members can view their own documents.
    // Handler checks unit-scoped access for CU viewing other members.
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> GetMemberDocuments(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberDocumentsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    // No permission attribute — members can upload their own documents,
    // CU can upload for members in their unit. Handler checks access.
    [HttpPost("upload")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(20 * 1024 * 1024)] // 20MB hard limit
    public async Task<IActionResult> Upload([FromForm] Guid memberId, [FromForm] Guid documentTypeId,
        [FromForm] string? title, [FromForm] DateOnly? expiryDate, [FromForm] DateOnly? issuedDate,
        IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "Aucun fichier n'a été fourni." });

        // Auto-fill title from document type name if not provided
        if (string.IsNullOrWhiteSpace(title))
        {
            var docType = await _context.DocumentTypes.FindAsync(documentTypeId);
            title = docType?.Name ?? "Document";
        }

        // Validate file size from settings
        var maxSizeSetting = await _context.Settings.FirstOrDefaultAsync(s => s.Key == "documents.max_file_size_mb");
        var maxSizeMb = int.TryParse(maxSizeSetting?.Value, out var parsed) ? parsed : 5;
        if (file.Length > maxSizeMb * 1024 * 1024)
            return BadRequest(new { error = $"Le fichier dépasse la taille maximale autorisée ({maxSizeMb} Mo)." });

        // Validate file extension
        var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLower();
        var allowedSetting = await _context.Settings.FirstOrDefaultAsync(s => s.Key == "documents.allowed_file_types");
        var allowedTypes = new[] { "pdf", "jpg", "jpeg", "png" };
        if (allowedSetting is not null)
        {
            try { allowedTypes = JsonSerializer.Deserialize<string[]>(allowedSetting.Value) ?? allowedTypes; } catch { }
        }
        if (!allowedTypes.Contains(ext))
            return BadRequest(new { error = $"Type de fichier non autorisé. Types acceptés : {string.Join(", ", allowedTypes)}" });

        // Validate file content matches extension
        using var headerStream = file.OpenReadStream();
        var header = new byte[4];
        await headerStream.ReadAsync(header.AsMemory(0, 4));
        headerStream.Position = 0;

        var isValid = ext switch
        {
            "pdf" => header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46, // %PDF
            "jpg" or "jpeg" => header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "png" => header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47, // .PNG
            _ => false
        };
        if (!isValid)
            return BadRequest(new { error = "Le contenu du fichier ne correspond pas à son extension." });

        // Save file to disk
        var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "documents");
        Directory.CreateDirectory(uploadsDir);

        var safeFileName = Path.GetFileName(file.FileName); // Strip any directory components
        var uniqueName = $"{Guid.CreateVersion7()}_{safeFileName}";
        var filePath = Path.Combine(uploadsDir, uniqueName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var relativePath = Path.Combine("uploads", "documents", uniqueName);

        var result = await Mediator.Send(new CreateMemberDocumentCommand(
            memberId, documentTypeId, title, relativePath, file.FileName, file.Length,
            file.ContentType, expiryDate, issuedDate
        ));

        if (!result.IsSuccess)
        {
            // Cleanup file on failure
            if (System.IO.File.Exists(filePath))
                System.IO.File.Delete(filePath);
            return BadRequest(new { error = result.Error });
        }

        return Created($"/api/v1/documents/{result.Value}", new { id = result.Value });
    }

    // No permission attribute — members can download their own documents.
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var doc = await Mediator.Send(new GetDocumentFileQuery(id));
        if (doc is null) return NotFound(new { error = "Document introuvable." });

        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), doc.FilePath));
        if (!fullPath.StartsWith(uploadsRoot) || !System.IO.File.Exists(fullPath))
            return NotFound(new { error = "Le fichier n'existe plus sur le serveur." });

        var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
        return File(stream, doc.MimeType, doc.FileName);
    }

    [HttpPut("{id:guid}/review")]
    [HasPermission(Permissions.DocumentsApprove)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewDocumentCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.DocumentsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberDocumentCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpGet("expiring")]
    [HasPermission(Permissions.DocumentsView)]
    public async Task<IActionResult> GetExpiring([FromQuery] int daysAhead = 30)
    {
        var result = await Mediator.Send(new GetExpiringDocumentsQuery(daysAhead));
        return Ok(result);
    }

    [HttpGet("unit/{unitId:guid}/matrix")]
    [HasPermission(Permissions.DocumentsView)]
    public async Task<IActionResult> GetUnitMatrix(Guid unitId, [FromQuery] string schoolYear = "2025-2026")
    {
        var result = await Mediator.Send(new GetUnitDocumentsMatrixQuery(unitId, schoolYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpGet("unit/{unitId:guid}/zip")]
    [HasPermission(Permissions.DocumentsView)]
    public async Task<IActionResult> DownloadZip(Guid unitId, [FromQuery] Guid? docTypeId)
    {
        var result = await Mediator.Send(new GetUnitDocumentFilesQuery(unitId, docTypeId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        var files = result.Value!;
        if (files.Count == 0)
            return BadRequest(new { error = "Aucun document à télécharger." });

        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        using var memoryStream = new MemoryStream();
        using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
        {
            foreach (var doc in files)
            {
                var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), doc.FilePath));
                if (!fullPath.StartsWith(uploadsRoot) || !System.IO.File.Exists(fullPath)) continue;

                // Organize: MemberName/DocTypeName_FileName
                var sanitizedMember = doc.MemberName.Replace("/", "-").Replace("\\", "-");
                var sanitizedDocType = doc.DocTypeName.Replace("/", "-").Replace("\\", "-");
                var ext = Path.GetExtension(doc.FileName);
                var entryName = $"{sanitizedMember}/{sanitizedDocType}{ext}";

                var entry = archive.CreateEntry(entryName);
                using var entryStream = entry.Open();
                using var fileStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
                await fileStream.CopyToAsync(entryStream);
            }
        }

        memoryStream.Position = 0;
        var zipName = docTypeId.HasValue ? $"Documents_{docTypeId}.zip" : "Documents_Unite.zip";
        return File(memoryStream.ToArray(), "application/zip", zipName);
    }
}
