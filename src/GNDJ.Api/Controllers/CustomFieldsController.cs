using GNDJ.Api.Authorization;
using GNDJ.Application.CustomFields;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin-defined custom member field definitions and their per-member values. Base route api/v1/custom-fields;
/// requires authentication (JWT/API-key). Field definitions are gated on associations.manage; per-member values
/// on members.view / members.edit.
/// </summary>
[Authorize]
[Route("api/v1/custom-fields")]
public class CustomFieldsController : BaseApiController
{
    /// <summary>Lists all custom field definitions. Requires associations.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetCustomFieldsQuery());
        return Ok(result);
    }

    /// <summary>Lists active custom field definitions. Auth-only — needed by any member form (e.g. Ma fiche).</summary>
    // No permission attribute — active field defs needed by any member form (e.g. Ma fiche).
    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var result = await Mediator.Send(new GetActiveCustomFieldsQuery());
        return Ok(result);
    }

    /// <summary>Creates a custom field definition. Requires associations.manage.</summary>
    [HttpPost]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateCustomFieldCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/custom-fields/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a custom field definition. Requires associations.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCustomFieldCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a custom field definition. Requires associations.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteCustomFieldCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Lists a member's custom field values. Requires members.view.</summary>
    [HttpGet("member/{memberId:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetMemberValues(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberCustomFieldValuesQuery(memberId));
        return Ok(result);
    }

    /// <summary>Sets (creates or updates) a member's value for a custom field. Requires members.edit.</summary>
    [HttpPut("member/{memberId:guid}/{customFieldId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> SetValue(Guid memberId, Guid customFieldId, [FromBody] SetValueRequest request)
    {
        var result = await Mediator.Send(new SetMemberCustomFieldValueCommand(memberId, customFieldId, request.Value));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { id = result.Value });
    }

    /// <summary>Deletes a member's custom field value. Requires members.edit.</summary>
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
