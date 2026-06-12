using GNDJ.Application.DocumentTypes;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/document-types")]
public class DocumentTypesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.DocumentTypesView)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await Mediator.Send(new GetDocumentTypesQuery(search, page, pageSize));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.DocumentTypesView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetDocumentTypeByIdQuery(id));
        if (result is null) return NotFound(new { error = "Type de document introuvable." });
        return Ok(result);
    }

    [HttpGet("list")]
    [HasPermission(Permissions.DocumentsView)]
    [OutputCache(PolicyName = "LookupData")]
    public async Task<IActionResult> GetList()
    {
        var result = await Mediator.Send(new GetDocumentTypeListQuery());
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Create([FromBody] CreateDocumentTypeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/document-types/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDocumentTypeCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.DocumentTypesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteDocumentTypeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
