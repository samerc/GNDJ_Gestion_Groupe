using GNDJ.Api.Authorization;
using GNDJ.Application.Demandes;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// CG-side review & approval of membership applications (demandes); base route api/v1/demandes.
// No class-level [Authorize] — every action is gated by [HasPermission] instead: reads need demande.view,
// writes (decide/bulk-decide/quota/send-responses) need demande.manage (both implied by Permissions.All for
// super-admin + association-admin). Most read endpoints REQUIRE a ?scoutYear (400 if missing — not a bug).
[Route("api/v1/demandes")]
public class DemandesController : BaseApiController
{
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

    [HttpGet("pending-count")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> PendingCount()
    {
        var result = await Mediator.Send(new GetPendingDemandeCountQuery());
        return Ok(new { count = result.Value });
    }

    [HttpGet("occupancy")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Occupancy([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetUnitOccupancyQuery(scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpGet("statistics")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Statistics([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetDemandeStatisticsQuery(scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPut("{id:guid}/decide")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> Decide(Guid id, [FromBody] DecideBody body)
    {
        var result = await Mediator.Send(new DecideDemandeCommand(id, body.Status, body.DecidedUnitId, body.DecisionNotes));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    // Bulk approve/decline (per-item unit), skips already-sent demandes; returns a per-item result summary.
    [HttpPost("bulk-decide")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> BulkDecide([FromBody] BulkDecideDemandeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPut("quota")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetQuota([FromBody] SetUnitIntakeQuotaCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    // Converts approved demandes → real Members (card#, login, deduped guardians, base-role assignment) and
    // queues the response emails. Advisory-locked + idempotent (skips already-sent) so a double-click / two CGs
    // at once is safe; returns a conversion summary.
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
