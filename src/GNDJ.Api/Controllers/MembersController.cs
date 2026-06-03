using GNDJ.Api.Authorization;
using GNDJ.Application.Members.Commands.AddAddress;
using GNDJ.Application.Members.Commands.AddEmail;
using GNDJ.Application.Members.Commands.AddPhone;
using GNDJ.Application.Members.Commands.CreateMember;
using GNDJ.Application.Members.Commands.DeleteAddress;
using GNDJ.Application.Members.Commands.DeleteEmail;
using GNDJ.Application.Members.Commands.DeleteMember;
using GNDJ.Application.Members.Commands.DeletePhone;
using GNDJ.Application.Members.Commands.UpdateMember;
using GNDJ.Application.Members.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
public class MembersController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search, [FromQuery] Guid? unitId, [FromQuery] Guid? teamId,
        [FromQuery] bool? noUnit, [FromQuery] string? sortBy, [FromQuery] string? sortDir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var result = await Mediator.Send(new GetMembersQuery(search, unitId, teamId, noUnit, sortBy, sortDir, page, pageSize));
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetMemberByIdQuery(id));
        if (result is null) return NotFound(new { error = "Membre introuvable." });
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.MembersCreate)]
    public async Task<IActionResult> Create([FromBody] CreateMemberCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/members/{result.Value!.MemberId}", result.Value);
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMemberCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.MembersDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // --- Contact endpoints ---

    [HttpPost("{memberId:guid}/phones")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> AddPhone(Guid memberId, [FromBody] AddPhoneCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpDelete("phones/{phoneId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeletePhone(Guid phoneId)
    {
        var result = await Mediator.Send(new DeletePhoneCommand(phoneId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPost("{memberId:guid}/emails")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> AddEmail(Guid memberId, [FromBody] AddEmailCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpDelete("emails/{emailId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteEmail(Guid emailId)
    {
        var result = await Mediator.Send(new DeleteEmailCommand(emailId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPost("{memberId:guid}/addresses")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> AddAddress(Guid memberId, [FromBody] AddAddressCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpDelete("addresses/{addressId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteAddress(Guid addressId)
    {
        var result = await Mediator.Send(new DeleteAddressCommand(addressId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
