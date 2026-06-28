using GNDJ.Api.Authorization;
using GNDJ.Application.Demandes;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// CG-side review and approval of membership applications (demandes). Base route api/v1/demandes. No class-level
/// [Authorize] — every action is gated by [HasPermission]: reads require demande.view; writes (decide / bulk-decide /
/// quota / send-responses) require demande.manage (both implied by Permissions.All for super-admin and
/// association-admin). Most read endpoints require a ?scoutYear query (400 if missing).
/// </summary>
[Route("api/v1/demandes")]
public class DemandesController : BaseApiController
{
    /// <summary>Lists demandes for review with optional filters. Requires demande.view.</summary>
    /// <param name="scoutYear">Required scout year (e.g. "2025-2026").</param>
    /// <param name="status">Optional status filter.</param>
    /// <param name="gender">Optional gender filter.</param>
    /// <param name="classe">Optional school class filter.</param>
    /// <param name="school">Optional school filter.</param>
    /// <param name="ageMin">Optional minimum age filter.</param>
    /// <param name="ageMax">Optional maximum age filter.</param>
    /// <param name="unitId">Optional unit filter.</param>
    [HttpGet]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> List([FromQuery] string scoutYear, [FromQuery] string? status,
        [FromQuery] string? gender, [FromQuery] string? classe, [FromQuery] string? school,
        [FromQuery] int? ageMin, [FromQuery] int? ageMax, [FromQuery] Guid? unitId)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetDemandesForReviewQuery(scoutYear, status, gender, classe, school, ageMin, ageMax, unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Returns the count of pending (undecided) demandes, for the CG sidebar badge. Requires demande.view.</summary>
    [HttpGet("pending-count")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> PendingCount()
    {
        var result = await Mediator.Send(new GetPendingDemandeCountQuery());
        return Ok(new { count = result.Value });
    }

    /// <summary>Returns per-unit capacity (current / projected / quota / accepted) for the scout year. Requires demande.view.</summary>
    /// <param name="scoutYear">Required scout year (e.g. "2025-2026").</param>
    [HttpGet("occupancy")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Occupancy([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetUnitOccupancyQuery(scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Returns the demande statistics dashboard (pipeline, capacity, demographics, quality). Requires demande.view.</summary>
    /// <param name="scoutYear">Required scout year (e.g. "2025-2026").</param>
    [HttpGet("statistics")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Statistics([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetDemandeStatisticsQuery(scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Approves (with chosen unit) or declines (with reason) a single demande. Requires demande.manage.</summary>
    [HttpPut("{id:guid}/decide")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> Decide(Guid id, [FromBody] DecideBody body)
    {
        var result = await Mediator.Send(new DecideDemandeCommand(id, body.Status, body.DecidedUnitId, body.DecisionNotes));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>
    /// Bulk approve/decline (per-item unit), skipping already-sent demandes; returns a per-item result summary.
    /// Requires demande.manage.
    /// </summary>
    [HttpPost("bulk-decide")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> BulkDecide([FromBody] BulkDecideDemandeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Sets a unit's intake quota for a scout year. Requires demande.manage.</summary>
    [HttpPut("quota")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetQuota([FromBody] SetUnitIntakeQuotaCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>
    /// Converts approved demandes into real members (card number, login, deduped guardians, base-role assignment) and
    /// queues the response emails. Advisory-locked and idempotent (skips already-sent), so a double-click or two CGs
    /// at once is safe; returns a conversion summary. Requires demande.manage.
    /// </summary>
    [HttpPost("send-responses")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SendResponses([FromBody] SendDemandeResponsesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    public record DecideBody(string Status, Guid? DecidedUnitId, string? DecisionNotes);
}
