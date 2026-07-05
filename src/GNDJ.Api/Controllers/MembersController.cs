using GNDJ.Api.Authorization;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Members.Commands.AddAddress;
using GNDJ.Application.Members.Commands.AddEmail;
using GNDJ.Application.Members.Commands.AddPhone;
using GNDJ.Application.Members.Commands.CreateMember;
using GNDJ.Application.Members.Commands.DeleteAddress;
using GNDJ.Application.Members.Commands.DeleteEmail;
using GNDJ.Application.Members.Commands.DeleteMember;
using GNDJ.Application.Members.Commands.DeletePhone;
using GNDJ.Application.Members.Commands.ResetMemberPassword;
using GNDJ.Application.Members.Commands.SetPrimaryContactEmail;
using GNDJ.Application.Members.Commands.UpdateAddress;
using GNDJ.Application.Members.Commands.UpdateEmail;
using GNDJ.Application.Members.Commands.UpdateMember;
using GNDJ.Application.Members.Commands.UpdatePhone;
using GNDJ.Application.Members.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Members resource (CRUD plus contacts, photos and password reset). Base route api/v1/members. Auth is JWT or API-key.
/// Per-action members.* permissions apply. Unit-scoping/IDOR is enforced in the query/command handlers, not here: a
/// non-super-admin only sees/edits members with an ACTIVE assignment in one of their authorized units (or their own
/// record). GetAll has list filters including alumni=true (former members, identity-only — contact withheld) plus
/// unitId/teamId/noUnit/search/sort. Photo upload/serve and reset-password carry their own access/validation notes.
/// </summary>
[Authorize]
public class MembersController : BaseApiController
{
    private readonly IApplicationDbContext _context;

    public MembersController(IApplicationDbContext context)
    {
        _context = context;
    }
    /// <summary>Lists members (paged), scoped to authorized units. Requires members.view.</summary>
    /// <param name="search">Optional name search (accent-insensitive).</param>
    /// <param name="unitId">Optional unit filter.</param>
    /// <param name="teamId">Optional team filter.</param>
    /// <param name="noUnit">When true, returns members with no active assignment.</param>
    /// <param name="alumni">When true, returns former members (identity only; contact withheld).</param>
    /// <param name="sortBy">Optional sort column.</param>
    /// <param name="sortDir">Optional sort direction (asc/desc).</param>
    [HttpGet]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search, [FromQuery] Guid? unitId, [FromQuery] Guid? teamId,
        [FromQuery] bool? noUnit, [FromQuery] bool? alumni, [FromQuery] string? sortBy, [FromQuery] string? sortDir,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var result = await Mediator.Send(new GetMembersQuery(search, unitId, teamId, noUnit, alumni, sortBy, sortDir, page, pageSize));
        return Ok(result);
    }

    /// <summary>Gets a member's full profile. Requires members.view; own profile or members in authorized units.</summary>
    /// <response code="404">No accessible member with this id.</response>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.MembersView)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetMemberByIdQuery(id));
        if (result is null) return NotFound(new { error = "Membre introuvable." });
        return Ok(result);
    }

    /// <summary>Creates a member (auto card number; optionally an auto user account). Requires members.create.</summary>
    /// <response code="201">Member created; body contains the created member.</response>
    [HttpPost]
    [HasPermission(Permissions.MembersCreate)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateMemberCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/members/{result.Value!.MemberId}", result.Value);
    }

    /// <summary>Updates a member. Requires members.edit; own profile or members in authorized units.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMemberCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Soft-deletes a member. Requires members.delete.</summary>
    /// <response code="404">No member with this id.</response>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.MembersDelete)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberCommand(id));
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("introuvable"))
                return NotFound(new { error = result.Error });
            return BadRequest(new { error = result.Error });
        }
        return NoContent();
    }

    /// <summary>
    /// Leader/CG resets a member's password, generating a temp password (returned once in the body). Requires
    /// members.reset_password; handler additionally requires super-admin OR an active-unit-leader of the member.
    /// </summary>
    /// <response code="404">The member has no user account.</response>
    [HttpPost("{id:guid}/reset-password")]
    [HasPermission(Permissions.MembersResetPassword)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> ResetPassword(Guid id)
    {
        var result = await Mediator.Send(new ResetMemberPasswordCommand(id));
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("pas de compte"))
                return NotFound(new { error = result.Error });
            return BadRequest(new { error = result.Error });
        }
        return Ok(result.Value);
    }

    /// <summary>Sets (or clears with an empty body) the member's primary contact email — the recipient for member-facing mail. Requires members.edit.</summary>
    [HttpPut("{id:guid}/primary-email")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> SetPrimaryEmail(Guid id, [FromBody] SetPrimaryEmailRequest body)
    {
        var result = await Mediator.Send(new SetPrimaryContactEmailCommand(id, body?.Email));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    public record SetPrimaryEmailRequest(string? Email);

    // --- Contact endpoints ---

    /// <summary>Adds a phone number to a member. Requires members.edit.</summary>
    /// <response code="201">Phone added; body contains the new id.</response>
    [HttpPost("{memberId:guid}/phones")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> AddPhone(Guid memberId, [FromBody] AddPhoneCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Deletes a member phone number. Requires members.edit.</summary>
    [HttpDelete("phones/{phoneId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeletePhone(Guid phoneId)
    {
        var result = await Mediator.Send(new DeletePhoneCommand(phoneId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Adds an email address to a member. Requires members.edit.</summary>
    /// <response code="201">Email added; body contains the new id.</response>
    [HttpPost("{memberId:guid}/emails")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> AddEmail(Guid memberId, [FromBody] AddEmailCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Deletes a member email address. Requires members.edit.</summary>
    [HttpDelete("emails/{emailId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteEmail(Guid emailId)
    {
        var result = await Mediator.Send(new DeleteEmailCommand(emailId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Adds an address to a member. Requires members.edit.</summary>
    /// <response code="201">Address added; body contains the new id.</response>
    [HttpPost("{memberId:guid}/addresses")]
    [HasPermission(Permissions.MembersEdit)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> AddAddress(Guid memberId, [FromBody] AddAddressCommand command)
    {
        if (memberId != command.MemberId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Deletes a member address. Requires members.edit.</summary>
    [HttpDelete("addresses/{addressId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DeleteAddress(Guid addressId)
    {
        var result = await Mediator.Send(new DeleteAddressCommand(addressId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Updates a member phone number. Requires members.edit.</summary>
    [HttpPut("phones/{phoneId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdatePhone(Guid phoneId, [FromBody] UpdatePhoneCommand command)
    {
        if (phoneId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Updates a member email address. Requires members.edit.</summary>
    [HttpPut("emails/{emailId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdateEmail(Guid emailId, [FromBody] UpdateEmailCommand command)
    {
        if (emailId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Updates a member address. Requires members.edit.</summary>
    [HttpPut("addresses/{addressId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdateAddress(Guid addressId, [FromBody] UpdateAddressCommand command)
    {
        if (addressId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // --- Photo endpoints ---

    /// <summary>
    /// Uploads a member photo (JPG/PNG, max 5MB; magic-byte validated, saved under uploads/photos, old photo replaced).
    /// Requires members.edit; access is super-admin, the member themselves, or a leader of one of the member's ACTIVE units.
    /// </summary>
    /// <response code="404">No member with this id.</response>
    [HttpPost("{memberId:guid}/photo")]
    [HasPermission(Permissions.MembersEdit)]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5MB
    [ProducesResponseType(404)]
    public async Task<IActionResult> UploadPhoto(Guid memberId, IFormFile file, [FromServices] ICurrentUserService currentUser)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "Aucun fichier n'a été fourni." });

        // Authorization: super admin, the member themselves, or a leader of the member's unit.
        if (!currentUser.IsSuperAdmin && currentUser.MemberId != memberId)
        {
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            var hasAccess = await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId));
            if (!hasAccess)
                return BadRequest(new { error = "Accès non autorisé à ce membre." });
        }

        var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLower();
        if (ext is not "jpg" and not "jpeg" and not "png")
            return BadRequest(new { error = "Format non supporté. Utilisez JPG ou PNG." });

        // MIME magic number validation
        using var headerStream = file.OpenReadStream();
        var header = new byte[4];
        var bytesRead = 0;
        while (bytesRead < 4)
        {
            var read = await headerStream.ReadAsync(header.AsMemory(bytesRead, 4 - bytesRead));
            if (read == 0) break;
            bytesRead += read;
        }
        headerStream.Position = 0;
        var isValid = ext switch
        {
            "jpg" or "jpeg" => bytesRead >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "png" => bytesRead >= 4 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47,
            _ => false
        };
        if (!isValid)
            return BadRequest(new { error = "Le contenu du fichier ne correspond pas à son extension." });

        var member = await _context.Members.FindAsync(memberId);
        if (member is null)
            return NotFound(new { error = "Membre introuvable." });

        // Save file
        var photosDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "photos");
        Directory.CreateDirectory(photosDir);

        var fileName = $"{memberId}.{ext}";
        var filePath = Path.Combine(photosDir, fileName);

        // Delete old photo if exists and different extension
        if (!string.IsNullOrEmpty(member.PhotoPath))
        {
            var oldPath = Path.Combine(Directory.GetCurrentDirectory(), member.PhotoPath);
            if (System.IO.File.Exists(oldPath)) System.IO.File.Delete(oldPath);
        }

        using (var stream = new FileStream(filePath, FileMode.Create))
            await file.CopyToAsync(stream);

        member.PhotoPath = Path.Combine("uploads", "photos", fileName);
        await _context.SaveChangesAsync();

        return Ok(new { photoPath = member.PhotoPath });
    }

    /// <summary>
    /// Serves a member's photo file. Auth + unit-scoped: super admin, the member themselves, or a leader of
    /// the member's active unit (same rule as viewing the member). An unauthorized caller gets 404 (not 403)
    /// so the member's existence isn't leaked and the UI falls back to initials. Path-traversal guarded via
    /// GetFullPath + StartsWith(uploadsRoot).
    /// </summary>
    /// <response code="404">No access, the member has no photo, or the file is missing.</response>
    [HttpGet("{memberId:guid}/photo")]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetPhoto(Guid memberId, [FromServices] ICurrentUserService currentUser)
    {
        // IDOR guard: a caller may only fetch a photo of themselves or a member in one of their units.
        if (!currentUser.IsSuperAdmin && currentUser.MemberId != memberId)
        {
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            var hasAccess = await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId));
            if (!hasAccess) return NotFound();
        }

        var member = await _context.Members.FindAsync(memberId);
        if (member is null || string.IsNullOrEmpty(member.PhotoPath))
            return NotFound();

        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var fullPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), member.PhotoPath));
        if (!fullPath.StartsWith(uploadsRoot) || !System.IO.File.Exists(fullPath))
            return NotFound();

        var contentType = Path.GetExtension(fullPath).ToLower() == ".png" ? "image/png" : "image/jpeg";
        return PhysicalFile(fullPath, contentType);
    }
}
