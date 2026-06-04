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
using GNDJ.Application.Members.Commands.UpdateAddress;
using GNDJ.Application.Members.Commands.UpdateEmail;
using GNDJ.Application.Members.Commands.UpdateMember;
using GNDJ.Application.Members.Commands.UpdatePhone;
using GNDJ.Application.Members.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
public class MembersController : BaseApiController
{
    private readonly IApplicationDbContext _context;

    public MembersController(IApplicationDbContext context)
    {
        _context = context;
    }
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
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("introuvable"))
                return NotFound(new { error = result.Error });
            return BadRequest(new { error = result.Error });
        }
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

    [HttpPut("phones/{phoneId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdatePhone(Guid phoneId, [FromBody] UpdatePhoneCommand command)
    {
        if (phoneId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPut("emails/{emailId:guid}")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> UpdateEmail(Guid emailId, [FromBody] UpdateEmailCommand command)
    {
        if (emailId != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

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

    [HttpPost("{memberId:guid}/photo")]
    [HasPermission(Permissions.MembersEdit)]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5MB
    public async Task<IActionResult> UploadPhoto(Guid memberId, IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "Aucun fichier n'a été fourni." });

        var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLower();
        if (ext is not "jpg" and not "jpeg" and not "png")
            return BadRequest(new { error = "Format non supporté. Utilisez JPG ou PNG." });

        // MIME magic number validation
        using var headerStream = file.OpenReadStream();
        var header = new byte[4];
        await headerStream.ReadAsync(header.AsMemory(0, 4));
        headerStream.Position = 0;
        var isValid = ext switch
        {
            "jpg" or "jpeg" => header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "png" => header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47,
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

    [HttpGet("{memberId:guid}/photo")]
    public async Task<IActionResult> GetPhoto(Guid memberId)
    {
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
