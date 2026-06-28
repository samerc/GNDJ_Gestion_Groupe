using GNDJ.Application.Progression;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// ─── Scout Stages ──────────────────────────

// Scout progression stages (per unit type, ordered). Route api/v1/scout-stages.
// Read = progression.view, mutate/reorder = progression.manage. Delete archives (IsActive=false) if used, else hard-deletes.
[Authorize]
[Route("api/v1/scout-stages")]
public class ScoutStagesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitTypeId)
    {
        var result = await Mediator.Send(new GetScoutStagesQuery(unitTypeId));
        return Ok(result);
    }

    [HttpGet("list")]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetList([FromQuery] Guid unitTypeId)
    {
        var result = await Mediator.Send(new GetScoutStageListQuery(unitTypeId));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Create([FromBody] CreateScoutStageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/scout-stages/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateScoutStageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteScoutStageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { archived = result.Value });
    }

    [HttpPut("reorder")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderScoutStagesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}

// ─── Badges ────────────────────────────────

// Badges (per unit type, ordered, linked to badge-type stages). Route api/v1/badges.
// Read = progression.view, mutate/reorder = progression.manage. Delete archives if used, else hard-deletes.
[Authorize]
[Route("api/v1/badges")]
public class BadgesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitTypeId)
    {
        var result = await Mediator.Send(new GetBadgesQuery(unitTypeId));
        return Ok(result);
    }

    [HttpGet("list")]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetList([FromQuery] Guid unitTypeId)
    {
        var result = await Mediator.Send(new GetBadgeListQuery(unitTypeId));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Create([FromBody] CreateBadgeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/badges/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBadgeCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteBadgeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { archived = result.Value });
    }

    [HttpPut("reorder")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Reorder([FromBody] ReorderBadgesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}

// ─── Member Progressions ───────────────────

// A member's earned stages/badges. Route api/v1/progressions.
// Create/Delete = progression.manage; the member-read below is auth-only (handler enforces unit-scope/own-profile).
[Authorize]
[Route("api/v1/progressions")]
public class ProgressionsController : BaseApiController
{
    // No permission attribute — handler enforces own-profile or unit-scoped access.
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> GetMemberProgressions(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberProgressionsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Create([FromBody] CreateMemberProgressionCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/progressions/{result.Value}", new { id = result.Value });
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberProgressionCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
