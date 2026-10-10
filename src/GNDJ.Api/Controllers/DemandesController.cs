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
        [FromQuery] int? ageMin, [FromQuery] int? ageMax, [FromQuery] Guid? unitId, [FromQuery] Guid? accountId)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetDemandesForReviewQuery(scoutYear, status, gender, classe, school, ageMin, ageMax, unitId, accountId)));
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
        return OkOrBadRequest(await Mediator.Send(new GetUnitOccupancyQuery(scoutYear)));
    }

    /// <summary>Returns the demande statistics dashboard (pipeline, capacity, demographics, quality). Requires demande.view.</summary>
    /// <param name="scoutYear">Required scout year (e.g. "2025-2026").</param>
    [HttpGet("statistics")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Statistics([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetDemandeStatisticsQuery(scoutYear)));
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

    /// <summary>Spreadsheet-mode quick edit of the child's own fields (nom, prénom, naissance, genre, classe, école) —
    /// never touches the household. Blocked once a member was created. Requires demande.manage.</summary>
    [HttpPut("{id:guid}/quick-edit")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> QuickEdit(Guid id, [FromBody] QuickEditBody body)
    {
        var result = await Mediator.Send(new QuickEditDemandeCommand(id, body.FirstName, body.LastName, body.DateOfBirth,
            body.Gender, body.Classe, body.School));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>CG edit of a full demande file (child fields + household: address, situation, parents/tuteurs,
    /// proches scouts), bypassing the submission deadline. Household edits affect every sibling demande on the
    /// same account. Blocked once a member was created. Requires demande.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> Edit(Guid id, [FromBody] AdminEditDemandeBody body)
        => NoContentOrBadRequest(await Mediator.Send(new AdminEditDemandeCommand(id, body.Child, body.Household)));

    /// <summary>Deletes a single demande (junk/spam/duplicate cleanup). Soft-delete; blocked once a member was
    /// created. Requires demande.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> Delete(Guid id)
        => NoContentOrBadRequest(await Mediator.Send(new DeleteDemandeCommand(id)));

    /// <summary>Removes the auto-matched sibling on a proche-scout relation (so the conversion won't share the
    /// household's guardians / declare a fratrie for that pair). Requires demande.manage.</summary>
    [HttpPost("relations/{relationId:guid}/unlink-member")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> UnlinkRelationMember(Guid relationId)
        => NoContentOrBadRequest(await Mediator.Send(new ClearScoutRelationMatchCommand(relationId)));

    /// <summary>What the CG compares before confirming a link: the declared proche + family parents next to the member
    /// (birth date, posts, parents), with the parents in common flagged. Requires demande.manage.</summary>
    [HttpGet("relations/{relationId:guid}/link-preview")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> LinkPreview(Guid relationId, [FromQuery] Guid memberId)
        => OkOrBadRequest(await Mediator.Send(new GetScoutRelationLinkPreviewQuery(relationId, memberId)));

    /// <summary>"Ce n'est pas lui": drops the app's suggested match for a proche. Requires demande.manage.</summary>
    [HttpPost("relations/{relationId:guid}/dismiss-suggestion")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> DismissSuggestion(Guid relationId)
        => NoContentOrBadRequest(await Mediator.Send(new DismissScoutRelationSuggestionCommand(relationId)));

    /// <summary>« Déjà membre ? » — the child IS this existing member. Not sent yet: the send will update that member
    /// instead of creating a new file. Already sent: the new file is merged into it now and the access email (existing
    /// identifiant) is sent. Requires demande.manage.</summary>
    [HttpPost("{id:guid}/member-match/confirm")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> ConfirmMemberMatch(Guid id, [FromBody] LinkRelationMemberBody body)
        => OkOrBadRequest(await Mediator.Send(new ConfirmDemandeMemberMatchCommand(id, body.MemberId)));

    /// <summary>« Déjà membre ? » — not the same person: a new member file is created. Requires demande.manage.</summary>
    [HttpPost("{id:guid}/member-match/reject")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> RejectMemberMatch(Guid id, [FromBody] LinkRelationMemberBody body)
        => NoContentOrBadRequest(await Mediator.Send(new RejectDemandeMemberMatchCommand(id, body.MemberId)));

    /// <summary>« Décisions à vérifier » — the CG confirms a refusal is intended (or removes that answer). Requires demande.manage.</summary>
    [HttpPost("{id:guid}/decision-check")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetDecisionChecked(Guid id, [FromBody] DecisionCheckBody body)
        => NoContentOrBadRequest(await Mediator.Send(new SetDemandeDecisionCheckedCommand(id, body.Checked)));

    /// <summary>Undoes a « Déjà membre ? » answer (only while nothing was merged). Requires demande.manage.</summary>
    [HttpDelete("{id:guid}/member-match")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> ClearMemberMatch(Guid id)
        => NoContentOrBadRequest(await Mediator.Send(new ClearDemandeMemberMatchCommand(id)));

    /// <summary>Confirms a brother/sister proche as an existing member (the suggested match or one picked by the CG),
    /// so the conversion shares the parents and declares the fratrie. Requires demande.manage.</summary>
    [HttpPost("relations/{relationId:guid}/link-member")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> LinkRelationMember(Guid relationId, [FromBody] LinkRelationMemberBody body)
        => NoContentOrBadRequest(await Mediator.Send(new LinkScoutRelationMemberCommand(relationId, body.MemberId)));

    /// <summary>Lists groups of duplicate demandes (same child submitted more than once) for the scout year, so
    /// the CG can merge them. Only mergeable demandes (not yet converted/sent). Requires demande.view.</summary>
    [HttpGet("duplicates")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Duplicates([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear)) return BadRequest(new { error = "L'année scoute est requise." });
        return OkOrBadRequest(await Mediator.Send(new GetDuplicateDemandeSuggestionsQuery(scoutYear)));
    }

    /// <summary>Merges duplicate demandes onto a keeper (chosen child fields + item-by-item parents/proches),
    /// deletes the loser demande(s) and any now-empty applicant account, optionally emails the accounts.
    /// Requires demande.manage.</summary>
    [HttpPost("merge")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> Merge([FromBody] MergeDemandesCommand command)
        => OkOrBadRequest(await Mediator.Send(command));

    /// <summary>Saves the pre-selected unit for a demande WITHOUT deciding (staged). Requires demande.manage.</summary>
    [HttpPut("{id:guid}/unit")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetUnit(Guid id, [FromBody] SetUnitBody body)
        => NoContentOrBadRequest(await Mediator.Send(new SetDemandeUnitCommand(id, body.DecidedUnitId)));

    /// <summary>
    /// Bulk approve/decline (per-item unit), skipping already-sent demandes; returns a per-item result summary.
    /// Requires demande.manage.
    /// </summary>
    [HttpPost("bulk-decide")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> BulkDecide([FromBody] BulkDecideDemandeCommand command)
        => OkOrBadRequest(await Mediator.Send(command));

    /// <summary>Sets a unit's intake quota for a scout year. Requires demande.manage.</summary>
    [HttpPut("quota")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SetQuota([FromBody] SetUnitIntakeQuotaCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>« Soumettre pour la famille »: the CG submits a draft the family never submitted, optionally accepting /
    /// refusing it at once; once the year's answers went out, that answer is sent immediately (member created, emails).
    /// Requires demande.manage (+ group manager in the handler).</summary>
    [HttpPost("{id:guid}/submit-for-family")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SubmitForFamily(Guid id, [FromBody] SubmitForFamilyBody body)
        => OkOrBadRequest(await Mediator.Send(new SubmitDraftForFamilyCommand(id, body.Decision, body.DecidedUnitId, body.DecisionNotes)));

    /// <summary>
    /// Converts approved demandes into real members (card number, login, deduped guardians, base-role assignment) and
    /// queues the response emails. Advisory-locked and idempotent (skips already-sent), so a double-click or two CGs
    /// at once is safe; returns a conversion summary. Requires demande.manage.
    /// </summary>
    [HttpPost("send-responses")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> SendResponses([FromBody] SendDemandeResponsesCommand command)
        => OkOrBadRequest(await Mediator.Send(command));

    /// <summary>« Ce qui va se passer » before « Envoyer les réponses »: members created per unit, refusals, emails to families,
    /// chefs d'unité notified, plus what would block the send. Read-only. Requires demande.view (+ group manager).</summary>
    [HttpGet("send-responses/preview")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> SendResponsesPreview([FromQuery] string scoutYear)
        => OkOrBadRequest(await Mediator.Send(new GetSendResponsesPreviewQuery(scoutYear ?? "")));

    /// <summary>The scheduled automatic « Envoyer les réponses » (Lebanon time) + the result of the last automatic run.
    /// Requires demande.view (+ group manager in the handler).</summary>
    [HttpGet("responses-schedule")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> GetResponsesSchedule()
        => OkOrBadRequest(await Mediator.Send(new GetDemandeResponsesScheduleQuery()));

    /// <summary>Schedules « Envoyer les réponses » for a date and time ("yyyy-MM-ddTHH:mm", Lebanon time; empty = cancel).
    /// A background job runs the same send at that moment. Requires demande.manage.</summary>
    [HttpPut("responses-schedule")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> ScheduleResponses([FromBody] ScheduleDemandeResponsesCommand command)
        => NoContentOrBadRequest(await Mediator.Send(command));

    /// <summary>
    /// Closes the campaign: archives every demande + its outcome into the permanent archive, then HARD-deletes all
    /// applicant-side data (accounts, guardians, relations, demandes) and disables inscriptions. Irreversible;
    /// converted members are untouched. Blocked while any submitted demande has no response. Requires demande.manage.
    /// </summary>
    [HttpPost("close-campaign")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> CloseCampaign([FromBody] CloseDemandeCampaignCommand command)
        => OkOrBadRequest(await Mediator.Send(command));

    /// <summary>Campaign status for the CG: portal open? submission window open? scout year. Requires demande.view.</summary>
    [HttpGet("campaign-status")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> CampaignStatus()
        => OkOrBadRequest(await Mediator.Send(new GetDemandeCampaignStatusQuery()));

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
    public async Task<IActionResult> Accounts([FromQuery] bool unverifiedOnly = false, [FromQuery] string? search = null, [FromQuery] bool notSubmittedOnly = false)
        => OkOrBadRequest(await Mediator.Send(new GetDemandeAccountsQuery(unverifiedOnly, search, notSubmittedOnly)));

    /// <summary>The drafts (never submitted) of one applicant account, read-only. Requires demande.view (+ group
    /// manager in the handler).</summary>
    [HttpGet("accounts/{id:guid}/drafts")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> AccountDrafts(Guid id)
        => OkOrBadRequest(await Mediator.Send(new GetAccountDraftsQuery(id)));

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

    /// <summary>Resets an applicant account's portal password to a fresh temp password (shown once for the CG to
    /// relay) and invalidates any active session. Requires demande.manage.</summary>
    [HttpPost("accounts/{id:guid}/reset-password")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> ResetAccountPassword(Guid id)
        => OkOrBadRequest(await Mediator.Send(new ResetApplicantPasswordCommand(id)));

    /// <summary>Hard-deletes an applicant account and ALL its data (demandes, guardians, scout relations).
    /// Any member already created from a demande is kept. Irreversible. Requires demande.manage.</summary>
    [HttpDelete("accounts/{id:guid}")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> DeleteAccount(Guid id)
        => OkOrBadRequest(await Mediator.Send(new DeleteApplicantAccountCommand(id)));

    // ── Late-submission invites ─────────────────────────────────────────────────────────────────────
    /// <summary>Lists the CG-generated late-submission invite links (active / claimed / expired / revoked).
    /// Requires demande.view.</summary>
    [HttpGet("invites")]
    [HasPermission(Permissions.DemandeView)]
    public async Task<IActionResult> Invites()
    {
        var result = await Mediator.Send(new GetDemandeInvitesQuery());
        return Ok(result.Value);
    }

    /// <summary>Generates a late-submission invite link so ONE family can enroll after the deadline without
    /// reopening for everyone. Returns the token (the frontend builds the full link). Requires demande.manage.</summary>
    [HttpPost("invites")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> CreateInvite([FromBody] CreateDemandeInviteCommand command)
        => OkOrBadRequest(await Mediator.Send(command));

    /// <summary>Revokes a late-submission invite (kept in the trail; marked revoked). Requires demande.manage.</summary>
    [HttpDelete("invites/{id:guid}")]
    [HasPermission(Permissions.DemandeManage)]
    public async Task<IActionResult> RevokeInvite(Guid id)
    {
        var result = await Mediator.Send(new RevokeDemandeInviteCommand(id));
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
        => OkOrBadRequest(await Mediator.Send(new GetDemandeArchivesQuery(search, scoutYear, page, pageSize)));

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
        return OkOrBadRequest(await Mediator.Send(new ImportDemandeDecisionsCommand(scoutYear, ms.ToArray())));
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
    public record SubmitForFamilyBody(string? Decision, Guid? DecidedUnitId, string? DecisionNotes);
    // CG edit body: the child fields (DemandeInput) + the shared household (SaveApplicantHouseholdCommand reused
    // as a plain data carrier — its own validator runs via AdminEditDemandeCommandValidator). Fully-qualified to
    // avoid pulling in the whole Applicants namespace (which also declares DeleteDemandeCommand /
    // ResetApplicantPasswordCommand → CS0104 ambiguity with the Demandes-namespace versions used here).
    public record AdminEditDemandeBody(
        GNDJ.Application.Applicants.DemandeInput Child,
        GNDJ.Application.Applicants.SaveApplicantHouseholdCommand Household);
    public record QuickEditBody(string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender, string? Classe, string? School);
    public record UpdateRejectionReasonsBody(IReadOnlyList<DemandeRejectionReasonDto>? Reasons);
}

public record LinkRelationMemberBody(Guid MemberId);
public record DecisionCheckBody(bool Checked);
