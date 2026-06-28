using GNDJ.Api.Authorization;
using GNDJ.Application.Guardians;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Guardians/parents (shared across siblings) plus their links, phones and emails. Base route api/v1/guardians.
/// Routes mix member-nested (members/{memberId}/guardians) and flat sub-resource paths (guardian-links/, phones/, emails/).
/// Auth is JWT or API-key; reads require members.view, all writes require members.edit (guardian data is member data).
/// </summary>
[Authorize]
public class GuardiansController : BaseApiController
{
    /// <summary>Lists the guardians linked to a member. Requires members.view; handler enforces unit-scope/IDOR (own profile or authorized units).</summary>
    [HttpGet("members/{memberId:guid}/guardians")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetMemberGuardians(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberGuardiansQuery(memberId));
        if (!result.IsSuccess) return Forbid(); // unit-scope/IDOR: handler fails when caller can't access this member
        return Ok(result.Value);
    }

    /// <summary>Typeahead to find an existing shared guardian to link (sibling case). Requires members.view; queries under 2 chars return empty.</summary>
    /// <param name="q">Search term; at least 2 characters or an empty result is returned.</param>
    [HttpGet("search")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Ok(Array.Empty<GuardianSearchDto>());
        var result = await Mediator.Send(new SearchGuardiansQuery(q));
        return Ok(result);
    }

    /// <summary>Creates a new guardian and links it to the member. Requires members.edit.</summary>
    /// <response code="201">Guardian created; body contains the new id.</response>
    [HttpPost("members/{memberId:guid}/guardians")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create(Guid memberId, [FromBody] CreateGuardianCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Updates a shared guardian's details. Requires members.edit.</summary>
    [HttpPut("{guardianId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Update(Guid guardianId, [FromBody] UpdateGuardianCommand command)
    {
        if (guardianId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Updates a member-guardian link (relationship, contact flags). Requires members.edit.</summary>
    [HttpPut("guardian-links/{linkId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdateLink(Guid linkId, [FromBody] UpdateGuardianLinkCommand command)
    {
        if (linkId != command.LinkId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Attaches an existing shared guardian to this member (sibling case); distinct from Create which adds a new one. Requires members.edit.</summary>
    /// <response code="201">Link created; body contains the new link id.</response>
    [HttpPost("members/{memberId:guid}/guardians/link")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Link(Guid memberId, [FromBody] LinkGuardianCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Removes the link between a member and a shared guardian (guardian itself is kept). Requires members.edit.</summary>
    [HttpDelete("guardian-links/{linkId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Unlink(Guid linkId)
    {
        var result = await Mediator.Send(new UnlinkGuardianCommand(linkId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Adds a phone number to a guardian. Requires members.edit.</summary>
    /// <response code="201">Phone added; body contains the new id.</response>
    [HttpPost("{guardianId:guid}/phones")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> AddPhone(Guid guardianId, [FromBody] AddGuardianPhoneCommand command)
    {
        if (guardianId != command.GuardianId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Adds an email address to a guardian. Requires members.edit.</summary>
    /// <response code="201">Email added; body contains the new id.</response>
    [HttpPost("{guardianId:guid}/emails")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> AddEmail(Guid guardianId, [FromBody] AddGuardianEmailCommand command)
    {
        if (guardianId != command.GuardianId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Deletes a guardian phone number. Requires members.edit.</summary>
    [HttpDelete("phones/{phoneId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeletePhone(Guid phoneId)
    {
        var result = await Mediator.Send(new DeleteGuardianPhoneCommand(phoneId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a guardian email address. Requires members.edit.</summary>
    [HttpDelete("emails/{emailId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteEmail(Guid emailId)
    {
        var result = await Mediator.Send(new DeleteGuardianEmailCommand(emailId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
