using GNDJ.Application.Members.Commands.MyContacts;
using GNDJ.Application.Members.Commands.UpdateMyProfile;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Member self-service edits of their OWN record (base route api/v1/my-profile). Authenticated but requires
/// NO members.edit permission — every action operates on the caller's own MemberId (resolved server-side),
/// and only fields a member is allowed to change are exposed. Used by "Ma fiche". Locked identity fields
/// (name, DOB, gender, matricule, card number) are never editable here. Data that needs approval
/// (progression, fonctions) is NOT in this controller.
/// </summary>
[Authorize]
[Route("api/v1/my-profile")]
public class MyProfileController : BaseApiController
{
    /// <summary>Updates the caller's own editable profile fields (nationalité, école, classe, section,
    /// groupe sanguin) and medical notes/allergies. No approval required.</summary>
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateMyProfileCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // ── Coordonnées: own phones / emails / addresses (add / edit / remove) ──────────────────────────
    // Each command is strictly own-scoped server-side (never a supplied member id), so no members.edit.

    /// <summary>Adds a phone to the caller's own record.</summary>
    [HttpPost("phones")]
    public async Task<IActionResult> AddPhone([FromBody] AddMyPhoneCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Edits one of the caller's own phones.</summary>
    [HttpPut("phones/{id:guid}")]
    public async Task<IActionResult> UpdatePhone(Guid id, [FromBody] UpdateMyPhoneCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes one of the caller's own phones.</summary>
    [HttpDelete("phones/{id:guid}")]
    public async Task<IActionResult> DeletePhone(Guid id) => Wrap(await Mediator.Send(new DeleteMyPhoneCommand(id)));

    /// <summary>Adds an email to the caller's own record.</summary>
    [HttpPost("emails")]
    public async Task<IActionResult> AddEmail([FromBody] AddMyEmailCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Edits one of the caller's own emails.</summary>
    [HttpPut("emails/{id:guid}")]
    public async Task<IActionResult> UpdateEmail(Guid id, [FromBody] UpdateMyEmailCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes one of the caller's own emails.</summary>
    [HttpDelete("emails/{id:guid}")]
    public async Task<IActionResult> DeleteEmail(Guid id) => Wrap(await Mediator.Send(new DeleteMyEmailCommand(id)));

    /// <summary>Adds an address to the caller's own record.</summary>
    [HttpPost("addresses")]
    public async Task<IActionResult> AddAddress([FromBody] AddMyAddressCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Edits one of the caller's own addresses.</summary>
    [HttpPut("addresses/{id:guid}")]
    public async Task<IActionResult> UpdateAddress(Guid id, [FromBody] UpdateMyAddressCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes one of the caller's own addresses.</summary>
    [HttpDelete("addresses/{id:guid}")]
    public async Task<IActionResult> DeleteAddress(Guid id) => Wrap(await Mediator.Send(new DeleteMyAddressCommand(id)));

    // Maps a Result to 204 (success) or 400 (with the error message).
    private IActionResult Wrap<T>(GNDJ.Application.Common.Models.Result<T> result)
        => result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
}
