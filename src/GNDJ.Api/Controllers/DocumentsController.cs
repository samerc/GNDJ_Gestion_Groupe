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

/// <summary>
/// Member document upload / download / review, plus the CU compliance matrix and zip export. Base route
/// api/v1/documents; requires authentication (JWT/API-key). Mixed auth model: read/upload/download actions have no
/// permission attribute (members act on their own docs; handlers enforce unit-scope for leaders), while
/// review/delete/matrix/zip use the documents.* permission family.
/// </summary>
[Authorize]
[Route("api/v1/documents")]
public class DocumentsController : BaseApiController
{
    private readonly IApplicationDbContext _context;

    public DocumentsController(IApplicationDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Lists a member's documents. Auth-only: members view their own; a unit leader views members in their unit
    /// (unit-scoped access enforced in the handler).
    /// </summary>
    // No permission attribute — members can view their own documents.
    // Handler checks unit-scoped access for CU viewing other members.
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> GetMemberDocuments(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberDocumentsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// Uploads a document file for a member (multipart form). Validates size, extension and magic bytes
    /// (PDF/JPG/PNG); rate-limited; 20MB hard cap. Auth-only: members upload their own, a CU uploads for members in
    /// their unit (access enforced in the handler).
    /// </summary>
    // No permission attribute — members can upload their own documents,
    // CU can upload for members in their unit. Handler checks access.
    [HttpPost("upload")]
    [ProducesResponseType(201)]
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
        var bytesRead = 0;
        while (bytesRead < 4)
        {
            var read = await headerStream.ReadAsync(header.AsMemory(bytesRead, 4 - bytesRead));
            if (read == 0) break;
            bytesRead += read;
        }
        headerStream.Position = 0;

        var isValid = ext switch
        {
            "pdf" => bytesRead >= 4 && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46, // %PDF
            "jpg" or "jpeg" => bytesRead >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "png" => bytesRead >= 4 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47, // .PNG
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

    /// <summary>
    /// Downloads a document as its original file (content type per stored MIME). Path-traversal guarded. Auth-only:
    /// members can download their own documents.
    /// </summary>
    /// <response code="404">Document not found, or the file no longer exists on the server.</response>
    // No permission attribute — members can download their own documents.
    [HttpGet("{id:guid}/download")]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Download(Guid id)
    {
        var doc = await Mediator.Send(new GetDocumentFileQuery(id));
        if (doc is null) return NotFound(new { error = "Document introuvable." });

        // Path-traversal guard: resolved path must stay under the uploads root.
        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), doc.FilePath));
        if (!fullPath.StartsWith(uploadsRoot) || !System.IO.File.Exists(fullPath))
            return NotFound(new { error = "Le fichier n'existe plus sur le serveur." });

        var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
        return File(stream, doc.MimeType, doc.FileName);
    }

    /// <summary>Approves or rejects a document (with optional notes). Requires documents.approve.</summary>
    [HttpPut("{id:guid}/review")]
    [HasPermission(Permissions.DocumentsApprove)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewDocumentCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a member document. Requires documents.delete.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.DocumentsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberDocumentCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Lists documents expiring within the given window. Requires documents.view.</summary>
    /// <param name="daysAhead">Look-ahead window in days (default 30).</param>
    [HttpGet("expiring")]
    [HasPermission(Permissions.DocumentsView)]
    public async Task<IActionResult> GetExpiring([FromQuery] int daysAhead = 30)
    {
        var result = await Mediator.Send(new GetExpiringDocumentsQuery(daysAhead));
        return Ok(result);
    }

    /// <summary>
    /// Returns the CU compliance matrix (members by document types, plus cotisation) for a unit and scout year.
    /// Requires documents.view.
    /// </summary>
    [HttpGet("unit/{unitId:guid}/matrix")]
    [HasPermission(Permissions.DocumentsView)]
    public async Task<IActionResult> GetUnitMatrix(Guid unitId, [FromQuery] string scoutYear = "2025-2026")
    {
        var result = await Mediator.Send(new GetUnitDocumentsMatrixQuery(unitId, scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// Returns a zip file of the unit's documents (optionally filtered by doc type), organized into
    /// MemberName/DocTypeName folders. Each file is re-checked against the uploads root (traversal guard).
    /// Requires documents.view.
    /// </summary>
    /// <param name="unitId">The unit whose documents to export.</param>
    /// <param name="docTypeId">Optional document type filter; when omitted, all the unit's documents are included.</param>
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
