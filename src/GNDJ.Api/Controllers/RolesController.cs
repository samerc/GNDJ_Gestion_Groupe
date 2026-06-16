using GNDJ.Api.Authorization;
using GNDJ.Application.Roles.Commands;
using GNDJ.Application.Roles.Queries;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

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

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.RolesManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteFunctionalRoleCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}

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
