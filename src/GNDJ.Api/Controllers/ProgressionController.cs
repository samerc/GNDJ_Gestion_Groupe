using GNDJ.Application.Progression;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// ─── Scout Stages ──────────────────────────

/// <summary>
/// Scout progression stages (per unit type, ordered). Route api/v1/scout-stages. Auth is JWT or API-key.
/// Read requires progression.view; mutate/reorder require progression.manage. Delete archives (IsActive=false) when the stage is used, else hard-deletes.
/// </summary>
[Authorize]
[Route("api/v1/scout-stages")]
public class ScoutStagesController : BaseApiController
{
    /// <summary>Lists scout stages, optionally filtered by unit type. Requires progression.view.</summary>
    /// <param name="unitTypeId">Optional unit-type filter; omit for all stages.</param>
    [HttpGet]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitTypeId)
    {
        var result = await Mediator.Send(new GetScoutStagesQuery(unitTypeId));
        return Ok(result);
    }

    /// <summary>Lists active stages of a unit type for pickers (ladder view). Requires progression.view.</summary>
    /// <param name="unitTypeId">Unit type whose stages to list.</param>
    [HttpGet("list")]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetList([FromQuery] Guid unitTypeId)
    {
        var result = await Mediator.Send(new GetScoutStageListQuery(unitTypeId));
        return Ok(result);
    }

    /// <summary>Creates a scout stage (code auto-generated from name if blank). Requires progression.manage.</summary>
    /// <response code="201">Stage created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ProgressionManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateScoutStageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/scout-stages/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a scout stage. Requires progression.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateScoutStageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a scout stage, or archives it (IsActive=false) if it is used by any progression. Requires progression.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteScoutStageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { archived = result.Value });
    }

    /// <summary>Reorders scout stages within a unit type (drag-and-drop). Requires progression.manage.</summary>
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

/// <summary>
/// Badges (per unit type, ordered, linked to badge-type stages). Route api/v1/badges. Auth is JWT or API-key.
/// Read requires progression.view; mutate/reorder require progression.manage. Delete archives when the badge is used, else hard-deletes.
/// </summary>
[Authorize]
[Route("api/v1/badges")]
public class BadgesController : BaseApiController
{
    /// <summary>Lists badges, optionally filtered by unit type. Requires progression.view.</summary>
    /// <param name="unitTypeId">Optional unit-type filter; omit for all badges.</param>
    [HttpGet]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? unitTypeId)
    {
        var result = await Mediator.Send(new GetBadgesQuery(unitTypeId));
        return Ok(result);
    }

    /// <summary>Lists active badges of a unit type for pickers (chip grid). Requires progression.view.</summary>
    /// <param name="unitTypeId">Unit type whose badges to list.</param>
    [HttpGet("list")]
    [HasPermission(Permissions.ProgressionView)]
    public async Task<IActionResult> GetList([FromQuery] Guid unitTypeId)
    {
        var result = await Mediator.Send(new GetBadgeListQuery(unitTypeId));
        return Ok(result);
    }

    /// <summary>Creates a badge (code auto-generated from name if blank). Requires progression.manage.</summary>
    /// <response code="201">Badge created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ProgressionManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateBadgeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/badges/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a badge. Requires progression.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBadgeCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a badge, or archives it (IsActive=false) if it is held by any member. Requires progression.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteBadgeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { archived = result.Value });
    }

    /// <summary>Reorders badges within a unit type (drag-and-drop). Requires progression.manage.</summary>
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

/// <summary>
/// A member's earned stages/badges. Route api/v1/progressions. Auth is JWT or API-key.
/// Create/Delete require progression.manage; the member-read is auth-only (handler enforces own-profile or unit-scoped access).
/// </summary>
[Authorize]
[Route("api/v1/progressions")]
public class ProgressionsController : BaseApiController
{
    /// <summary>Lists a member's progressions (stages/badges earned). Auth-only; handler enforces own-profile or unit-scoped access.</summary>
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> GetMemberProgressions(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberProgressionsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Records a stage/badge a member earned (date, location, notes). Requires progression.manage.</summary>
    /// <response code="201">Progression recorded; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ProgressionManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateMemberProgressionCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/progressions/{result.Value}", new { id = result.Value });
    }

    /// <summary>Edits a member progression record (unit/stage/badge/date/location/notes). Requires progression.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMemberProgressionCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "Identifiant incohérent." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a member progression record. Requires progression.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ProgressionManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteMemberProgressionCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
