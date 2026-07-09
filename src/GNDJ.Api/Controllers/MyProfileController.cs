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
}
