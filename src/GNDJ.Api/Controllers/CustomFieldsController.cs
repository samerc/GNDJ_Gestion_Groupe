using GNDJ.Api.Authorization;
using GNDJ.Application.CustomFields;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/custom-fields")]
public class CustomFieldsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetCustomFieldsQuery());
        return Ok(result);
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var result = await Mediator.Send(new GetActiveCustomFieldsQuery());
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateCustomFieldCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/custom-fields/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCustomFieldCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteCustomFieldCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpGet("member/{memberId:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetMemberValues(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberCustomFieldValuesQuery(memberId));
        return Ok(result);
    }

    [HttpPut("member/{memberId:guid}/{customFieldId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> SetValue(Guid memberId, Guid customFieldId, [FromBody] SetValueRequest request)
    {
        var result = await Mediator.Send(new SetMemberCustomFieldValueCommand(memberId, customFieldId, request.Value));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { id = result.Value });
    }

    [HttpDelete("values/{id:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteValue(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberCustomFieldValueCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}

public record SetValueRequest(string Value);
