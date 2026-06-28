using GNDJ.Api.Authorization;
using GNDJ.Application.Roles.Commands;
using GNDJ.Application.Roles.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Functional roles (per unit type). Route api/v1/functional-roles.
// Read = roles.view, mutate = roles.manage. Reorder = drag-to-rank (top = most senior); set-default marks the
// auto-assigned new-member role; Delete archives if used (else hard-deletes), Unarchive restores. {id}/members
// lists who holds the role. group-access (Get/Set) is the CG-only per-area access editor — gated roles.manage_group.
[Authorize]
[Route("api/v1/functional-roles")]
public class RolesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitTypeId)
    {
        var result = await Mediator.Send(new GetFunctionalRolesQuery(unitTypeId));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Create([FromBody] CreateFunctionalRoleCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/functional-roles/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFunctionalRoleCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpGet("{id:guid}/members")]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var result = await Mediator.Send(new GetFunctionalRoleMembersQuery(id));
        return Ok(result);
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { archived = result.Value });
    }

    [HttpPost("{id:guid}/unarchive")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Unarchive(Guid id)
    {
        var result = await Mediator.Send(new UnarchiveFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPut("reorder")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderFunctionalRolesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPost("{id:guid}/set-default")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> SetDefault(Guid id)
    {
        var result = await Mediator.Send(new SetDefaultFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // Chef de Groupe: per-area access of group staff (ACG, Aumônier…).
    [HttpGet("group-access")]
    [HasPermission(Permissions.RolesManageGroup)]
    public async Task<IActionResult> GetGroupAccess()
    {
        var result = await Mediator.Send(new GetGroupFunctionAccessQuery());
        return Ok(result);
    }

    [HttpPost("{id:guid}/group-access")]
    [HasPermission(Permissions.RolesManageGroup)]
    public async Task<IActionResult> SetGroupAccess(Guid id, [FromBody] SetGroupFunctionAccessCommand command)
    {
        if (id != command.FunctionalRoleId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}

// Security profiles (permission sets assigned to functional roles). Route api/v1/security-profiles.
// Read = roles.view, mutate = roles.manage. {id}/members lists accounts holding the profile (super-admin profile
// lists the flagged accounts since super-admin is a flag, not a role). Delete is blocked for system/in-use profiles.
[Authorize]
[Route("api/v1/security-profiles")]
public class SecurityProfilesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetSecurityProfilesQuery());
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetSecurityProfileByIdQuery(id));
        if (result is null) return NotFound(new { error = "Profil introuvable." });
        return Ok(result);
    }

    [HttpGet("{id:guid}/members")]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var result = await Mediator.Send(new GetSecurityProfileMembersQuery(id));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Create([FromBody] CreateSecurityProfileCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/security-profiles/{result.Value}", new { id = result.Value });
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteSecurityProfileCommand(id));
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("introuvable")) return NotFound(new { error = result.Error });
            return BadRequest(new { error = result.Error });
        }
        return NoContent();
    }

    [HttpPut("{id:guid}/permissions")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> UpdatePermissions(Guid id, [FromBody] UpdateSecurityProfilePermissionsCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
