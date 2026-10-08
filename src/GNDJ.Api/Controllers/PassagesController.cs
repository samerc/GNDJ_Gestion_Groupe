using GNDJ.Application.Passages;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Annual passage workflow: members move unit/team/role between scout years. Route api/v1/passages. Auth is JWT or API-key.
/// Status flow Pending -&gt; Approved -&gt; Finalized (the CG changes a line instead of rejecting it). CU proposes and finishes their
/// unit (passage.propose), CG reviews/changes lines and posts the whole group (passage.manage)
/// (passage.manage), read is passage.view. The scoutYear query param is required on all read endpoints (a round is scoped to one year).
/// </summary>
[Authorize]
[Route("api/v1/passages")]
public class PassagesController : BaseApiController
{
    /// <summary>CU view: passage proposals for one unit. Requires passage.view.</summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    [HttpGet("unit/{unitId:guid}")]
    [HasPermission(Permissions.PassageView)]
    public async Task<IActionResult> GetPassagesByUnit(Guid unitId, [FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetPassagesByUnitQuery(unitId, scoutYear)));
    }

    /// <summary>CG review list across all units, with optional status/unit filters. Requires passage.manage.</summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    /// <param name="status">Optional status filter (e.g. Pending, Approved, Rejected, Finalized).</param>
    /// <param name="unitId">Optional unit filter.</param>
    [HttpGet]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetAllPassages([FromQuery] string scoutYear, [FromQuery] string? status, [FromQuery] Guid? unitId)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetAllPassagesQuery(scoutYear, status, unitId)));
    }

    /// <summary>CG completeness view: expected vs. missing passage lines per unit (finalize gate). Requires passage.manage.</summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    [HttpGet("summary")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetPassageSummary([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetPassageSummaryQuery(scoutYear)));
    }

    /// <summary>
    /// CG "next year" projection: per-unit roster preview for the coming year. Returns raw per-member movement +
    /// unit metadata so the client can toggle between simulation (all pending+approved lines applied) and réel
    /// (approved only). Requires passage.manage.
    /// </summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    [HttpGet("projection")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetPassageProjection([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetPassageProjectionQuery(scoutYear)));
    }

    /// <summary>Reports whether the CG has opened the passage round for the year. Auth-only (no permission required).</summary>
    /// <param name="scoutYear">Scout year to check.</param>
    [HttpGet("status")]
    public async Task<IActionResult> IsPassageOpen([FromQuery] string scoutYear)
        => OkOrBadRequest(await Mediator.Send(new IsPassageOpenQuery(scoutYear ?? string.Empty)));

    /// <summary>CU proposes a passage change for one member. Requires passage.propose.</summary>
    /// <response code="201">Proposal created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.PassagePropose)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Propose([FromBody] ProposePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/passages/{result.Value}", new { id = result.Value });
    }

    /// <summary>Bulk CU propose (e.g. "Pas de changement" for many members at once); returns the processed count. Requires passage.propose.</summary>
    [HttpPost("bulk")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> BulkPropose([FromBody] BulkProposePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>CG accepts a line or changes it (unit/team/role or leaving), with an optional reason shown to the CU. Requires passage.manage.</summary>
    [HttpPut("{id:guid}/review")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewPassageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        return NoContentOrBadRequest(await Mediator.Send(command));
    }

    /// <summary>CG bulk accept of lines as proposed; returns the processed count. Requires passage.manage.</summary>
    [HttpPost("bulk-review")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> BulkReview([FromBody] BulkReviewPassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>CG reminds the leaders of every unit that hasn't finished its passage (notification + email). Requires passage.manage.</summary>
    [HttpPost("remind-units")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> RemindUnits([FromBody] RemindPassageUnitsCommand command)
        => OkOrBadRequest(await Mediator.Send(command));

    /// <summary>CG gives several lines the same decision (unit / équipe / fonction, or leaving) with an optional reason; returns the count. Requires passage.manage.</summary>
    [HttpPost("bulk-change")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> BulkChange([FromBody] BulkChangePassagesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>
    /// CG posts the passage for the whole group: accepts lines still pending, ends old assignments and creates new ones, then emails
    /// each receiving unit's CU its newcomers; returns the count posted. Requires passage.manage. Blocked until every active member has
    /// a line and every unit is finished. Serialized via a Postgres advisory lock and idempotent.
    /// </summary>
    [HttpPost("finalize")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Finalize([FromBody] FinalizeBody body)
    {
        var result = await Mediator.Send(new FinalizePassagesCommand(body.ScoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    public record FinalizeBody(string ScoutYear);

    /// <summary>« Ce qui va se passer » before « Publier le passage »: lines published, unit changes per destination,
    /// leavers, planned maîtrise changes, chefs d'unité notified, plus what would block it. Read-only. Requires passage.manage.</summary>
    [HttpGet("finalize/preview")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> FinalizePreview([FromQuery] string scoutYear)
        => OkOrBadRequest(await Mediator.Send(new GetFinalizePreviewQuery(scoutYear ?? "")));

    /// <summary>The scheduled automatic « Publier le passage » (Lebanon time) + the result of the last automatic run.
    /// Requires passage.manage.</summary>
    [HttpGet("finalize-schedule")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetFinalizeSchedule()
        => OkOrBadRequest(await Mediator.Send(new GetPassageFinalizeScheduleQuery()));

    /// <summary>Schedules « Publier le passage » for a date and time ("yyyy-MM-ddTHH:mm", Lebanon time; empty = cancel).
    /// A background job runs the same publication at that moment. Requires passage.manage.</summary>
    [HttpPut("finalize-schedule")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> ScheduleFinalize([FromBody] SchedulePassageFinalizeCommand command)
        => NoContentOrBadRequest(await Mediator.Send(command));

    /// <summary>Finish status of one unit's passage (finished?, members without a line). Requires passage.view + unit access.</summary>
    [HttpGet("unit/{unitId:guid}/status")]
    [HasPermission(Permissions.PassageView)]
    public async Task<IActionResult> GetUnitStatus(Guid unitId, [FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetPassageUnitStatusQuery(unitId, scoutYear)));
    }

    /// <summary>CU (or CG) finishes a unit's passage: every member must have a line; the unit is then locked for the CU. Requires passage.propose.</summary>
    [HttpPost("unit/{unitId:guid}/submit")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> SubmitUnit(Guid unitId, [FromBody] PassageYearBody body)
        => NoContentOrBadRequest(await Mediator.Send(new SubmitPassageUnitCommand(unitId, body.ScoutYear)));

    /// <summary>CG reopens a finished unit so its CU can change it again. Requires passage.manage.</summary>
    [HttpPost("unit/{unitId:guid}/reopen")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> ReopenUnit(Guid unitId, [FromBody] PassageYearBody body)
        => NoContentOrBadRequest(await Mediator.Send(new ReopenPassageUnitCommand(unitId, body.ScoutYear)));

    /// <summary>Associations that received newcomers in the posted passage (one Word document each). Requires passage.manage.</summary>
    [HttpGet("newcomers")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetNewcomerGroups([FromQuery] string scoutYear)
        => OkOrBadRequest(await Mediator.Send(new GetPassageNewcomerGroupsQuery(scoutYear ?? "")));

    /// <summary>Word document of the newcomers for one association (omit associationId for units without one). Requires passage.manage.</summary>
    [HttpGet("newcomers/docx")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetNewcomersDoc([FromQuery] string scoutYear, [FromQuery] Guid? associationId)
    {
        var result = await Mediator.Send(new GetPassageNewcomersDocQuery(scoutYear ?? "", associationId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!.Data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", result.Value.FileName);
    }

    /// <summary>CG opens or closes the passage process for the year (gates CU proposals). Requires passage.manage.</summary>
    [HttpPost("toggle")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Toggle([FromBody] TogglePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Deletes a passage proposal line. Requires passage.propose.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> Delete(Guid id)
        => NoContentOrBadRequest(await Mediator.Send(new DeletePassageCommand(id)));
}

/// <summary>Body carrying only the scout year.</summary>
public record PassageYearBody(string ScoutYear);
