using GNDJ.Application.DocumentTypes;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

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
