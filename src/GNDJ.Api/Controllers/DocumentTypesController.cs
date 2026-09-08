using GNDJ.Application.DocumentTypes;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin-managed document type definitions (codes, expiry/approval flags). Base route api/v1/document-types;
/// requires authentication (JWT/API-key). Reads require document_types.view; create/update/delete require
/// document_types.manage.
/// </summary>
[Authorize]
[Route("api/v1/document-types")]
public class DocumentTypesController : BaseApiController
{
    /// <summary>Lists document types (paged, optional search). Requires document_types.view.</summary>
    [HttpGet]
    [HasPermission(Permissions.DocumentTypesView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetDocumentTypesQuery(search, page, pageSize));
        return Ok(result);
    }

    /// <summary>Returns a single document type by id. Requires document_types.view.</summary>
    /// <response code="404">Document type not found.</response>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(404)]
    [HasPermission(Permissions.DocumentTypesView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetDocumentTypeByIdQuery(id));
        if (result is null) return NotFound(new { error = "Type de document introuvable." });
        return Ok(result);
    }

    /// <summary>
    /// Lightweight document type lookup for upload/matrix pickers. Gated on documents.view (not document_types.view)
    /// so any document uploader can list types; output-cached as static lookup data. Requires documents.view.
    /// </summary>
    [HttpGet("list")]
    [HasPermission(Permissions.DocumentsView)]
    [OutputCache(PolicyName = "LookupData")]
    public async Task<IActionResult> GetList()
    {
        var result = await Mediator.Send(new GetDocumentTypeListQuery());
        return Ok(result);
    }

    // Allowed template formats: the blank form a member downloads to fill + upload back. PDF + images + Office
    // (Word/Excel, incl. legacy .doc/.xls) — a fillable form is often a Word/Excel document, not just a PDF.
    private static readonly string[] TemplateAllowed = { "pdf", "jpg", "jpeg", "png", "webp", "gif", "doc", "docx", "xls", "xlsx" };

    /// <summary>
    /// Uploads an OPTIONAL template (blank form) for a document type — the file members download to fill and
    /// upload back. PDF / Word / Excel / image, max 15 MB, magic-byte validated. Stored in uploads/content and
    /// served (anonymously — a blank form is non-sensitive) by the content-files endpoint. Returns the URL +
    /// original file name to store on the document type. Requires document_types.manage. Rate-limited.
    /// </summary>
    [HttpPost("template")]
    [HasPermission(Permissions.DocumentTypesManage)]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(15 * 1024 * 1024)] // 15MB
    public async Task<IActionResult> UploadTemplate(IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "Aucun fichier." });
        if (file.Length > 15 * 1024 * 1024) return BadRequest(new { error = "Fichier trop volumineux (max 15 Mo)." });

        var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLowerInvariant();
        if (!TemplateAllowed.Contains(ext)) return BadRequest(new { error = "Format non autorisé (PDF, Word, Excel, JPG, PNG)." });

        // Magic-byte check (defense-in-depth against a renamed file). Office Open XML (docx/xlsx) is a ZIP
        // container (PK\x03\x04); legacy .doc/.xls is an OLE compound file (D0 CF 11 E0 A1 B1 1A E1).
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
                "docx" or "xlsx" => read >= 4 && header[0] == 0x50 && header[1] == 0x4B && header[2] == 0x03 && header[3] == 0x04, // PK ZIP
                "doc" or "xls" => read >= 8 && header[0] == 0xD0 && header[1] == 0xCF && header[2] == 0x11 && header[3] == 0xE0
                          && header[4] == 0xA1 && header[5] == 0xB1 && header[6] == 0x1A && header[7] == 0xE1, // OLE
                _ => false,
            };
            if (!ok) return BadRequest(new { error = "Le contenu du fichier ne correspond pas à son extension." });
        }

        var dir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "content");
        Directory.CreateDirectory(dir);
        var fileName = $"{Guid.CreateVersion7()}.{ext}";
        await using (var fs = System.IO.File.Create(Path.Combine(dir, fileName)))
            await file.CopyToAsync(fs);

        return Ok(new { url = $"/api/v1/content/files/{fileName}", name = Path.GetFileName(file.FileName), size = file.Length });
    }

    /// <summary>Creates a document type. Requires document_types.manage.</summary>
    [HttpPost]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Create([FromBody] CreateDocumentTypeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/document-types/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a document type. Requires document_types.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDocumentTypeCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Reorders document types (drag-and-drop). Sets display order from the given id sequence. Requires document_types.manage.</summary>
    [HttpPut("reorder")]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderDocumentTypesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a document type. Requires document_types.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteDocumentTypeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
