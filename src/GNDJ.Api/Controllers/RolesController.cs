using GNDJ.Api.Authorization;
using GNDJ.Application.Roles.Commands;
using GNDJ.Application.Roles.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Functional roles per unit type, base route <c>api/v1/functional-roles</c>. Authenticated; reading requires
/// roles.view, mutating requires roles.manage. Reorder is drag-to-rank (top = most senior); set-default marks the
/// auto-assigned new-member role; Delete archives a role if it is in use (else hard-deletes), Unarchive restores it.
/// The group-access endpoints are the CG-only per-area access editor, gated by roles.manage_group.
/// </summary>
[Authorize]
[Route("api/v1/functional-roles")]
public class RolesController : BaseApiController
{
    /// <summary>Lists functional roles, optionally filtered by unit type. Requires roles.view.</summary>
    /// <param name="unitTypeId">When set, restricts the list to one unit type.</param>
    [HttpGet]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitTypeId)
    {
        var result = await Mediator.Send(new GetFunctionalRolesQuery(unitTypeId));
        return Ok(result);
    }

    /// <summary>Creates a functional role. Requires roles.manage.</summary>
    /// <response code="201">Role created; body carries the new id.</response>
    [ProducesResponseType(201)]
    [HttpPost]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Create([FromBody] CreateFunctionalRoleCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/functional-roles/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a functional role. Requires roles.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFunctionalRoleCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Lists the members who currently hold this role. Requires roles.view.</summary>
    [HttpGet("{id:guid}/members")]
    [HasPermission(Permissions.RolesView)]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var result = await Mediator.Send(new GetFunctionalRoleMembersQuery(id));
        return Ok(result);
    }

    /// <summary>Deletes a functional role — archives it if it is used by members, otherwise hard-deletes. Returns whether it was archived. Requires roles.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { archived = result.Value });
    }

    /// <summary>Restores a previously archived functional role. Requires roles.manage.</summary>
    [HttpPost("{id:guid}/unarchive")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Unarchive(Guid id)
    {
        var result = await Mediator.Send(new UnarchiveFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Reorders functional roles within a unit type (drag-to-rank, top = most senior). Requires roles.manage.</summary>
    [HttpPut("reorder")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderFunctionalRolesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Marks this role as the default auto-assigned role for new members of its unit type (clears the others). Requires roles.manage.</summary>
    [HttpPost("{id:guid}/set-default")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> SetDefault(Guid id)
    {
        var result = await Mediator.Send(new SetDefaultFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Returns the per-area access matrix for group staff functions (ACG, Aumônier…). Requires roles.manage_group.</summary>
    [HttpGet("group-access")]
    [HasPermission(Permissions.RolesManageGroup)]
    public async Task<IActionResult> GetGroupAccess()
    {
        var result = await Mediator.Send(new GetGroupFunctionAccessQuery());
        return Ok(result);
    }

    /// <summary>Sets the per-area access (Aucun/Lecture/Complet) for one group function. Requires roles.manage_group.</summary>
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

/// <summary>
/// Security profiles — permission sets assigned to functional roles, base route <c>api/v1/security-profiles</c>.
/// Authenticated; reading requires maitrise.manage (super-admin / Chef de Groupe — this is a manager tool),
/// mutating requires roles.manage. Reading is deliberately NOT on roles.view: a Chef d'Unité holds roles.view
/// (needed for the functional-role/Fonction picker) but must NOT be able to browse the authorization model or
/// enumerate who holds each profile (every admin/CG). The members endpoint lists the accounts holding a profile
/// (the super-admin profile lists the flagged accounts, since super-admin is a flag, not a role). Deletion is
/// blocked for system or in-use profiles.
/// </summary>
[Authorize]
[Route("api/v1/security-profiles")]
public class SecurityProfilesController : BaseApiController
{
    /// <summary>Lists all security profiles. Requires maitrise.manage (manager-only).</summary>
    [HttpGet]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetSecurityProfilesQuery());
        return Ok(result);
    }

    /// <summary>Returns one security profile with its permissions. Requires maitrise.manage (manager-only).</summary>
    /// <response code="404">No profile matches the id.</response>
    [ProducesResponseType(404)]
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetSecurityProfileByIdQuery(id));
        if (result is null) return NotFound(new { error = "Profil introuvable." });
        return Ok(result);
    }

    /// <summary>Lists the accounts holding this profile. Requires maitrise.manage (manager-only).</summary>
    [HttpGet("{id:guid}/members")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var result = await Mediator.Send(new GetSecurityProfileMembersQuery(id));
        return Ok(result);
    }

    /// <summary>Creates a custom security profile. Requires roles.manage.</summary>
    /// <response code="201">Profile created; body carries the new id.</response>
    [ProducesResponseType(201)]
    [HttpPost]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Create([FromBody] CreateSecurityProfileCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/security-profiles/{result.Value}", new { id = result.Value });
    }

    /// <summary>Deletes a custom security profile (blocked for system or in-use profiles). Requires roles.manage.</summary>
    /// <response code="404">No profile matches the id.</response>
    [ProducesResponseType(404)]
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

    /// <summary>Updates the permission set of a security profile. Requires roles.manage.</summary>
    [HttpPut("{id:guid}/permissions")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> UpdatePermissions(Guid id, [FromBody] UpdateSecurityProfilePermissionsCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Merges the SOURCE profile into the TARGET (repoints its fonctions, deletes the source) — for cleaning up duplicate profiles. Requires roles.manage.</summary>
    [HttpPost("merge")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Merge([FromBody] MergeSecurityProfilesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { rolesRepointed = result.Value });
    }
}
