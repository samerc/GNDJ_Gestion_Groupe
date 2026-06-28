using GNDJ.Api.Authorization;
using GNDJ.Application.Guardians;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Guardians/parents (shared across siblings) + their links, phones, emails — base route api/v1/guardians.
// Routes mix member-nested (members/{memberId}/guardians) and flat sub-resource paths (guardian-links/, phones/, emails/).
// [Authorize] = JWT or API-key required; reads gated by MembersView, all writes by MembersEdit (guardian data is member data).
[Authorize]
public class GuardiansController : BaseApiController
{
    [HttpGet("members/{memberId:guid}/guardians")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetMemberGuardians(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberGuardiansQuery(memberId));
        if (!result.IsSuccess) return Forbid(); // unit-scope/IDOR: handler fails when caller can't access this member
        return Ok(result.Value);
    }

    [HttpGet("search")]
    [HasPermission(Permissions.MembersView)]
    // Typeahead for linking an existing shared guardian; <2 chars returns empty (no full-table scan / leak).
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Ok(Array.Empty<GuardianSearchDto>());
        var result = await Mediator.Send(new SearchGuardiansQuery(q));
        return Ok(result);
    }

    [HttpPost("members/{memberId:guid}/guardians")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Create(Guid memberId, [FromBody] CreateGuardianCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpPut("{guardianId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Update(Guid guardianId, [FromBody] UpdateGuardianCommand command)
    {
        if (guardianId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPut("guardian-links/{linkId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdateLink(Guid linkId, [FromBody] UpdateGuardianLinkCommand command)
    {
        if (linkId != command.LinkId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // Attaches an EXISTING shared guardian to this member (sibling case) — distinct from Create which adds a new one.
    [HttpPost("members/{memberId:guid}/guardians/link")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Link(Guid memberId, [FromBody] LinkGuardianCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpDelete("guardian-links/{linkId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Unlink(Guid linkId)
    {
        var result = await Mediator.Send(new UnlinkGuardianCommand(linkId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPost("{guardianId:guid}/phones")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> AddPhone(Guid guardianId, [FromBody] AddGuardianPhoneCommand command)
    {
        if (guardianId != command.GuardianId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpPost("{guardianId:guid}/emails")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> AddEmail(Guid guardianId, [FromBody] AddGuardianEmailCommand command)
    {
        if (guardianId != command.GuardianId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpDelete("phones/{phoneId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeletePhone(Guid phoneId)
    {
        var result = await Mediator.Send(new DeleteGuardianPhoneCommand(phoneId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("emails/{emailId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteEmail(Guid emailId)
    {
        var result = await Mediator.Send(new DeleteGuardianEmailCommand(emailId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
