using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Documents;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

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
    // Accepts one OR several files (an ID card front + back, a multi-page scan): the first becomes the
    // document's page 1, the rest extra pages — one reviewable document. IFormFileCollection captures every
    // uploaded file regardless of field name, so old single-file ("file") callers keep working.
    [HttpPost("upload")]
    [ProducesResponseType(201)]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(20 * 1024 * 1024)] // 20MB hard limit
    public async Task<IActionResult> Upload([FromForm] Guid memberId, [FromForm] Guid documentTypeId,
        [FromForm] string? title, [FromForm] DateOnly? expiryDate, [FromForm] DateOnly? issuedDate,
        IFormFileCollection files)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new { error = "Aucun fichier n'a été fourni." });

        // Auto-fill title from document type name if not provided
        if (string.IsNullOrWhiteSpace(title))
        {
            var docType = await _context.DocumentTypes.FindAsync(documentTypeId);
            title = docType?.Name ?? "Document";
        }

        var (saved, savedPaths, error) = await DocumentUploadFiles.SaveAsync(_context, files);
        if (error is not null) return BadRequest(new { error });

        var result = await Mediator.Send(new UploadMemberDocumentCommand(
            memberId, documentTypeId, title!, expiryDate, issuedDate, saved));

        if (!result.IsSuccess)
        {
            DocumentUploadFiles.Cleanup(savedPaths);
            return BadRequest(new { error = result.Error });
        }

        return Created($"/api/v1/documents/{result.Value}", new { id = result.Value });
    }

    /// <summary>
    /// Adds one or more extra pages/files to an existing document (e.g. the back of an ID). Same auth as upload;
    /// re-opens a rejected document for review. Requires no permission (handler checks own/leader access).
    /// </summary>
    [HttpPost("{id:guid}/pages")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> AddPages(Guid id, IFormFileCollection files)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new { error = "Aucun fichier n'a été fourni." });

        var (saved, savedPaths, error) = await DocumentUploadFiles.SaveAsync(_context, files);
        if (error is not null) return BadRequest(new { error });

        var result = await Mediator.Send(new AddDocumentPagesCommand(id, saved));
        if (!result.IsSuccess)
        {
            DocumentUploadFiles.Cleanup(savedPaths);
            return BadRequest(new { error = result.Error });
        }
        return Ok(new { id = result.Value });
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

        // Open in a try/catch: the file can be deleted/locked between the Exists check and the open (a
        // concurrent purge/delete during the busy week) — return 404 instead of a 500.
        try
        {
            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
            // Sensitive-access audit: record who obtained this member's file (downloads are logged, reads are not).
            await LogDownload(new LogDocumentDownloadCommand(id));
            return File(stream, doc.MimeType, doc.FileName);
        }
        catch (IOException)
        {
            return NotFound(new { error = "Le fichier n'est pas accessible pour le moment." });
        }
    }

    // Best-effort audit of a served download — a logging hiccup must never break the download itself.
    private async Task LogDownload(IRequest<bool> command)
    {
        try { await Mediator.Send(command); } catch { /* audit is best-effort */ }
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

    /// <summary>Downloads an extra page of a document. Auth-only (own/leader access in the handler); traversal guarded.</summary>
    /// <response code="404">Page not found, or the file no longer exists.</response>
    [HttpGet("pages/{pageId:guid}/download")]
    [ProducesResponseType(404)]
    public async Task<IActionResult> DownloadPage(Guid pageId)
    {
        var doc = await Mediator.Send(new GetDocumentPageFileQuery(pageId));
        if (doc is null) return NotFound(new { error = "Fichier introuvable." });

        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), doc.FilePath));
        if (!fullPath.StartsWith(uploadsRoot) || !System.IO.File.Exists(fullPath))
            return NotFound(new { error = "Le fichier n'existe plus sur le serveur." });

        try
        {
            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
            await LogDownload(new LogDocumentPageDownloadCommand(pageId));
            return File(stream, doc.MimeType, doc.FileName);
        }
        catch (IOException) { return NotFound(new { error = "Le fichier n'est pas accessible pour le moment." }); }
    }

    /// <summary>Deletes one extra page of a document (and its file on disk). Requires documents.delete.</summary>
    [HttpDelete("pages/{pageId:guid}")]
    [HasPermission(Permissions.DocumentsDelete)]
    public async Task<IActionResult> DeletePage(Guid pageId)
    {
        var result = await Mediator.Send(new DeleteDocumentPageCommand(pageId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        // Hard delete of the page → remove its file (best-effort, traversal-guarded).
        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), result.Value!.FilePath));
        if (fullPath.StartsWith(uploadsRoot))
            try { if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath); } catch { /* best effort */ }
        return NoContent();
    }

    /// <summary>Deletes page 1 (the primary file) of a document by promoting the next page to primary, and
    /// removes the old primary file from disk. Fails if the document has no other page. Requires documents.delete.</summary>
    [HttpDelete("{id:guid}/primary-page")]
    [HasPermission(Permissions.DocumentsDelete)]
    public async Task<IActionResult> DeletePrimaryPage(Guid id)
    {
        var result = await Mediator.Send(new DeleteDocumentPrimaryPageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), result.Value!.FilePath));
        if (fullPath.StartsWith(uploadsRoot))
            try { if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath); } catch { /* best effort */ }
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
            return BadRequest(new { error = "Aucun document à télécharger dans cette unité pour le moment." });

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
                var entryName = $"{sanitizedMember}/{sanitizedDocType}{doc.PageLabel}{ext}";

                // A single unreadable/locked file must not abort the whole zip (500) — skip it and continue.
                try
                {
                    var entry = archive.CreateEntry(entryName);
                    using var entryStream = entry.Open();
                    using var fileStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
                    await fileStream.CopyToAsync(entryStream);
                }
                catch (IOException) { /* skip this file, keep building the zip */ }
            }
        }

        memoryStream.Position = 0;
        var zipName = docTypeId.HasValue ? $"Documents_{docTypeId}.zip" : "Documents_Unite.zip";
        // Sensitive-access audit: a bulk export of a whole unit's documents is the highest-exposure download.
        await LogDownload(new LogZipDownloadCommand(unitId, docTypeId, files.Count));
        return File(memoryStream.ToArray(), "application/zip", zipName);
    }

    /// <summary>
    /// "Relance documents" overview — every unit that has at least one incomplete dossier, with the count of
    /// incomplete members (and how many are reachable by email). Drives the CG one-click-per-unit worklist.
    /// CG-level feature: requires maitrise.manage.
    /// </summary>
    [HttpGet("reminder-summary")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetReminderSummary()
    {
        var result = await Mediator.Send(new GetDocumentReminderSummaryQuery());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// "Relance documents" (Chef de Groupe) — lists a unit's members whose dossier is incomplete (missing /
    /// rejected / expired required documents) with the exact gaps + their resolved contact email.
    /// Fully-compliant members are omitted. CG-level feature: requires maitrise.manage (group manager).
    /// </summary>
    /// <param name="unitId">The unit whose non-compliant members to list.</param>
    [HttpGet("unit/{unitId:guid}/reminder-candidates")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetReminderCandidates(Guid unitId)
    {
        var result = await Mediator.Send(new GetDocumentReminderCandidatesQuery(unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// Sends a document-reminder email (the member's list of missing/to-correct/to-renew documents) to a whole
    /// unit or an explicit member list, via the durable outbox. Members whose dossier is complete are skipped.
    /// Returns a sent / no-email / compliant report. CG-level feature: requires maitrise.manage.
    /// </summary>
    [HttpPost("send-reminders")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> SendReminders([FromBody] SendDocumentRemindersCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    // ══════════════ Document-verification campaign ══════════════
    // A group-wide, date-driven schedule that opens/closes member uploads automatically and runs the two
    // verification steps (error emails, then on-hold for still-incomplete dossiers) — auto when verification is
    // done, else the CG is alerted and presses the buttons. See DocumentCampaign / DocumentCampaignActions.

    /// <summary>Current campaign status (phase + upload open/closed + dates). Auth-only — drives member/CU banners.</summary>
    [HttpGet("campaign")]
    public async Task<IActionResult> GetCampaign()
        => Ok((await Mediator.Send(new GetDocumentCampaignStatusQuery())).Value);

    /// <summary>CG dashboard: status + per-unit pending/incomplete + completion + step markers. Requires maitrise.manage.</summary>
    [HttpGet("campaign/admin")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetCampaignAdmin()
    {
        var r = await Mediator.Send(new GetDocumentCampaignAdminQuery());
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Sets the campaign schedule (enabled + the 5 dates + scout year). Requires maitrise.manage.</summary>
    [HttpPut("campaign")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> UpdateCampaign([FromBody] UpdateDocumentCampaignCommand command)
    {
        var r = await Mediator.Send(command);
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }

    /// <summary>Manually send the error emails to all incomplete members now. Requires maitrise.manage.</summary>
    [HttpPost("campaign/send-errors")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> SendCampaignErrors()
    {
        var r = await Mediator.Send(new SendDocumentCampaignErrorsCommand());
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Manually put every still-incomplete dossier on hold now + email them. Requires maitrise.manage.</summary>
    [HttpPost("campaign/apply-hold")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> ApplyCampaignHold()
    {
        var r = await Mediator.Send(new ApplyDocumentCampaignHoldCommand());
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Lists members currently on hold (for reactivation). Requires maitrise.manage.</summary>
    [HttpGet("on-hold")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetOnHold()
    {
        var r = await Mediator.Send(new GetOnHoldMembersQuery());
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Reactivates a member (clears the on-hold flag). Requires maitrise.manage.</summary>
    [HttpPost("on-hold/{memberId:guid}/reactivate")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Reactivate(Guid memberId)
    {
        var r = await Mediator.Send(new ReactivateMemberCommand(memberId));
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }
}
