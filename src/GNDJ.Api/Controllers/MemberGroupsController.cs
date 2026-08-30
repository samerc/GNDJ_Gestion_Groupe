using GNDJ.Api.Authorization;
using GNDJ.Application.MemberGroups;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Reusable rule-based member groups (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …). Base route
/// <c>api/v1/member-groups</c>. Managed by a group manager (Chef de Groupe / ACG / super-admin) — gated on
/// <c>maitrise.manage</c>. Membership is computed live from each group's rules.
/// </summary>
[Route("api/v1/member-groups")]
[HasPermission(Permissions.MaitriseManage)]
public class MemberGroupsController : BaseApiController
{
    /// <summary>Lists all member groups with their scope, rules and live member count.</summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var r = await Mediator.Send(new GetMemberGroupsQuery());
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Lists the members currently resolved by a group's rules (name, unit, team, role).</summary>
    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> Members(Guid id)
    {
        var r = await Mediator.Send(new GetMemberGroupMembersQuery(id));
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Creates a member group (name, scope, visibility + membership rules).</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateMemberGroupCommand command)
    {
        var r = await Mediator.Send(command);
        return r.IsSuccess ? Ok(new { id = r.Value }) : BadRequest(new { error = r.Error });
    }

    /// <summary>Updates a member group. A system preset can only be shown/hidden.</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMemberGroupCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var r = await Mediator.Send(command);
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }

    /// <summary>Deletes a member group (blocked for a preset or a group still used by réunions — hide it instead).</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var r = await Mediator.Send(new DeleteMemberGroupCommand(id));
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }
}
