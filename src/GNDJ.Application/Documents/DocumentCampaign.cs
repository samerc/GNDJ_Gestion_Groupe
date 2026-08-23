using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// The group-wide document-verification campaign. A single yearly schedule (set by the CG) whose dates drive,
// automatically (computed on read — no scheduler needed for the gating itself), whether members may upload:
//
//   Avant  ── deposit_start ──►  Dépôt (upload OPEN)  ── deposit_deadline ──►  Vérification 1 (closed)
//     ── correction_start ──►  Correction (upload OPEN)  ── correction_deadline ──►  Vérification 2 (closed)
//     ── final_deadline ──►  Terminé (closed)
//
// The two EMAIL/on-hold steps (at correction_start and final_deadline) are fired by a daily background job when
// verification is done, else the CG is alerted and does it manually — see DocumentCampaignActions.

public static class DocumentCampaignPhases
{
    public const string Inactive = "Inactive";       // campaign off or misconfigured → no gating
    public const string Before = "Avant";            // before deposit_start
    public const string Deposit = "Depot";           // upload open
    public const string Verification1 = "Verification1"; // upload closed, CU verifying
    public const string Correction = "Correction";   // upload open (members fix)
    public const string Verification2 = "Verification2"; // upload closed, CU re-verifying
    public const string Done = "Termine";            // after final_deadline
}

// Setting keys for the campaign (all under documents.*). Dates are yyyy-MM-dd or empty.
public static class DocumentCampaignKeys
{
    public const string Enabled = "documents.campaign_enabled";
    public const string ScoutYear = "documents.scout_year";
    public const string DepositStart = "documents.deposit_start";
    public const string DepositDeadline = "documents.deposit_deadline";
    public const string CorrectionStart = "documents.correction_start";
    public const string CorrectionDeadline = "documents.correction_deadline";
    public const string FinalDeadline = "documents.final_deadline";
    // Idempotency markers — the scout year the automated step last ran for (so it fires once per campaign).
    public const string ErrorsSentFor = "documents.errors_sent_for";
    public const string ErrorsAlertFor = "documents.errors_alert_for";
    public const string HoldAppliedFor = "documents.hold_applied_for";
    public const string HoldAlertFor = "documents.hold_alert_for";
}

// Computed campaign status. UploadOpen is what the upload endpoints + member banners key on. UploadReopensOn /
// UploadClosesOn feed the banner ("le dépôt rouvrira le …" / "fermeture le …").
public record DocumentCampaignStatus(
    bool Enabled, string Phase, bool UploadOpen,
    DateOnly? DepositStart, DateOnly? DepositDeadline, DateOnly? CorrectionStart,
    DateOnly? CorrectionDeadline, DateOnly? FinalDeadline,
    DateOnly? UploadReopensOn, DateOnly? UploadClosesOn, string? ScoutYear);

public static class DocumentCampaign
{
    // Reads the campaign settings and computes the current phase from today. When the campaign is off, or the
    // 5 dates aren't all set in strictly increasing order, gating is DISABLED (UploadOpen = true) so a
    // misconfiguration can never lock every member out of uploading.
    public static async Task<DocumentCampaignStatus> LoadAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var keys = new[]
        {
            DocumentCampaignKeys.Enabled, DocumentCampaignKeys.ScoutYear,
            DocumentCampaignKeys.DepositStart, DocumentCampaignKeys.DepositDeadline,
            DocumentCampaignKeys.CorrectionStart, DocumentCampaignKeys.CorrectionDeadline,
            DocumentCampaignKeys.FinalDeadline,
        };
        var settings = await context.Settings.Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        string? Get(string k) => settings.TryGetValue(k, out var v) ? v : null;
        static DateOnly? ParseDate(string? v) =>
            DateOnly.TryParse(v, out var d) ? d : (DateOnly?)null;

        var enabled = string.Equals(Get(DocumentCampaignKeys.Enabled), "true", StringComparison.OrdinalIgnoreCase);
        var scoutYear = Get(DocumentCampaignKeys.ScoutYear);
        var d1 = ParseDate(Get(DocumentCampaignKeys.DepositStart));
        var d2 = ParseDate(Get(DocumentCampaignKeys.DepositDeadline));
        var d3 = ParseDate(Get(DocumentCampaignKeys.CorrectionStart));
        var d4 = ParseDate(Get(DocumentCampaignKeys.CorrectionDeadline));
        var d5 = ParseDate(Get(DocumentCampaignKeys.FinalDeadline));

        // Misconfigured (off or dates not strictly ordered) → no gating.
        var ordered = d1 is { } && d2 is { } && d3 is { } && d4 is { } && d5 is { }
            && d1 < d2 && d2 < d3 && d3 < d4 && d4 < d5;
        if (!enabled || !ordered)
            return new DocumentCampaignStatus(enabled, DocumentCampaignPhases.Inactive, true,
                d1, d2, d3, d4, d5, null, null, scoutYear);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        string phase; bool open; DateOnly? reopensOn = null, closesOn = null;
        if (today < d1!.Value) { phase = DocumentCampaignPhases.Before; open = false; reopensOn = d1; }
        else if (today < d2!.Value) { phase = DocumentCampaignPhases.Deposit; open = true; closesOn = d2; }
        else if (today < d3!.Value) { phase = DocumentCampaignPhases.Verification1; open = false; reopensOn = d3; }
        else if (today < d4!.Value) { phase = DocumentCampaignPhases.Correction; open = true; closesOn = d4; }
        else if (today < d5!.Value) { phase = DocumentCampaignPhases.Verification2; open = false; }
        else { phase = DocumentCampaignPhases.Done; open = false; }

        return new DocumentCampaignStatus(true, phase, open, d1, d2, d3, d4, d5, reopensOn, closesOn, scoutYear);
    }
}
