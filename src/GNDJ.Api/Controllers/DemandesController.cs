using GNDJ.Api.Authorization;
using GNDJ.Application.Demandes;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

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

    /// <summary>Saves the pre-selected unit for a demande WITHOUT deciding (staged). Requires demande.manage.</summary>
    [HttpPut("{id:guid}/unit")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetUnit(Guid id, [FromBody] SetUnitBody body)
    {
        var result = await Mediator.Send(new SetDemandeUnitCommand(id, body.DecidedUnitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
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

    /// <summary>
    /// Closes the campaign: archives every demande + its outcome into the permanent archive, then HARD-deletes all
    /// applicant-side data (accounts, guardians, relations, demandes) and disables inscriptions. Irreversible;
    /// converted members are untouched. Blocked while any submitted demande has no response. Requires demande.manage.
    /// </summary>
    [HttpPost("close-campaign")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> CloseCampaign([FromBody] CloseDemandeCampaignCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Campaign status for the CG: portal open? submission window open? scout year. Requires demande.view.</summary>
    [HttpGet("campaign-status")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> CampaignStatus()
    {
        var result = await Mediator.Send(new GetDemandeCampaignStatusQuery());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Opens/closes the submission window (inner period). Closing starts the review phase — parents keep
    /// read-only access but can no longer create/edit/submit. Requires demande.manage.</summary>
    [HttpPost("submissions")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetSubmissions([FromBody] SetDemandeSubmissionsCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Lists applicant (parent) accounts — incl. unverified ones with no demande — so the CG can spot a
    /// parent whose verification email failed. Optional unverifiedOnly + search. Requires demande.view.</summary>
    [HttpGet("accounts")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Accounts([FromQuery] bool unverifiedOnly = false, [FromQuery] string? search = null)
    {
        var result = await Mediator.Send(new GetDemandeAccountsQuery(unverifiedOnly, search));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Manually marks an applicant account's email as verified (safety net when the verification email
    /// never arrived, so the parent can log in + submit). Requires demande.manage.</summary>
    [HttpPost("accounts/{id:guid}/verify-email")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> VerifyAccountEmail(Guid id)
    {
        var result = await Mediator.Send(new VerifyApplicantEmailManuallyCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    // ── Reminders (G) ────────────────────────────────────────────────────────────────────────────────
    /// <summary>Count of applicant accounts with no submitted demande this year (reminder-A audience). demande.view.</summary>
    [HttpGet("unsubmitted-count")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> UnsubmittedCount([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetUnsubmittedCountQuery(scoutYear));
        return Ok(new { count = result.Value });
    }

    /// <summary>Emails a "please submit before the deadline" reminder to every account with no submitted demande
    /// this year. Manual (CG button). Requires demande.manage.</summary>
    [HttpPost("send-submission-reminders")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SendSubmissionReminders([FromBody] SendSubmissionRemindersCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { sent = result.Value });
    }

    // ── Archive browse (H) ───────────────────────────────────────────────────────────────────────────
    /// <summary>Searches the permanent demande archive (past campaigns) by child name / scout year. demande.view.</summary>
    [HttpGet("archives")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Archives([FromQuery] string? search, [FromQuery] string? scoutYear, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var result = await Mediator.Send(new GetDemandeArchivesQuery(search, scoutYear, page, pageSize));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    // ── Excel decisions round-trip (I) ───────────────────────────────────────────────────────────────
    /// <summary>Exports the submitted demandes to an .xlsx (Décision/Unité/Motif columns to fill). demande.view.</summary>
    [HttpGet("export-decisions")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> ExportDecisions([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new ExportDemandeDecisionsQuery(scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!.Data, result.Value.ContentType, result.Value.FileName);
    }

    /// <summary>Imports a filled decisions .xlsx and stages the approve/decline choices. Requires demande.manage.</summary>
    [HttpPost("import-decisions")]
    [HasPermission(Permissions.DemandeManage)]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> ImportDecisions([FromForm] string scoutYear, IFormFile file)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        if (file is null || file.Length == 0) return BadRequest(new { error = "Aucun fichier." });
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var result = await Mediator.Send(new ImportDemandeDecisionsCommand(scoutYear, ms.ToArray()));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    // ── Rejection reasons (managed list) ─────────────────────────────────────────────────────────────
    /// <summary>Lists the demande rejection reasons (code + libellé + texte). Requires demande.view.</summary>
    [HttpGet("rejection-reasons")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> GetRejectionReasons()
    {
        var result = await Mediator.Send(new GetDemandeRejectionReasonsQuery());
        return Ok(result.Value);
    }

    /// <summary>Replaces the whole rejection-reasons list. Requires demande.manage.</summary>
    [HttpPut("rejection-reasons")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> UpdateRejectionReasons([FromBody] UpdateRejectionReasonsBody body)
    {
        var result = await Mediator.Send(new UpdateDemandeRejectionReasonsCommand(body.Reasons ?? []));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { updated = true });
    }

    public record DecideBody(string Status, Guid? DecidedUnitId, string? DecisionNotes);
    public record SetUnitBody(Guid? DecidedUnitId);
    public record UpdateRejectionReasonsBody(IReadOnlyList<DemandeRejectionReasonDto>? Reasons);
}
