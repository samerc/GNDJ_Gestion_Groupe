using System.Globalization;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// Deadline ANCHORS — the fixed catalog of date-typed settings a rentrée task can hang its due date on.
// When a template/task has a DeadlineAnchor, its REAL due date is resolved LIVE from that setting's value
// (yyyy-MM-dd) at read time, so the checklist always reflects the year's actual calendar (the same dates the
// CG sets for the passage, the demande window, and the document campaign) and "overdue" fires correctly.
// A blank/unset setting → fall back to the task's manual DueDate, then to the fuzzy DeadlineLabel text.
// Keep in sync with the frontend catalog in client/src/lib/rentree-anchors.ts.
public static class RentreeAnchors
{
    // anchor key (= an existing date-typed setting key) → French label shown in the template editor.
    public static readonly IReadOnlyList<(string Key, string Label)> All = new[]
    {
        ("demande.submission_start", "Ouverture des soumissions (inscriptions)"),
        ("demande.submission_deadline", "Date limite des soumissions (inscriptions)"),
        ("demande.member_start_date", "Début des nouveaux membres"),
        ("passage.date", "Date du passage"),
        ("documents.deposit_start", "Dépôt des documents — début"),
        ("documents.deposit_deadline", "Dépôt des documents — date limite"),
        ("documents.correction_start", "Correction des documents — début"),
        ("documents.correction_deadline", "Correction des documents — date limite"),
        ("documents.final_deadline", "Documents — échéance finale"),
    };

    public static readonly HashSet<string> Keys = All.Select(a => a.Key).ToHashSet();

    // A valid anchor is null/empty (no anchor) or one of the known date-setting keys.
    public static bool IsValid(string? key) => string.IsNullOrEmpty(key) || Keys.Contains(key);

    // Resolve each task's EFFECTIVE due date: the anchored date-setting value (if the task has an anchor and the
    // setting holds a valid yyyy-MM-dd date), otherwise the task's stored manual DueDate. Batched — reads only
    // the settings actually referenced by the given tasks.
    public static async Task<Dictionary<Guid, DateOnly?>> ResolveDueDatesAsync(
        IApplicationDbContext context, IReadOnlyList<RentreeTask> tasks, CancellationToken ct)
    {
        var anchorKeys = tasks.Where(t => !string.IsNullOrEmpty(t.DeadlineAnchor))
            .Select(t => t.DeadlineAnchor!).Distinct().ToList();

        var settingDates = new Dictionary<string, DateOnly?>();
        if (anchorKeys.Count > 0)
        {
            var raw = await context.Settings.Where(s => anchorKeys.Contains(s.Key))
                .Select(s => new { s.Key, s.Value }).ToListAsync(ct);
            foreach (var s in raw)
                settingDates[s.Key] = DateOnly.TryParseExact(s.Value, "yyyy-MM-dd",
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
        }

        var result = new Dictionary<Guid, DateOnly?>();
        foreach (var t in tasks)
        {
            DateOnly? due = t.DueDate; // manual fixed date is the fallback
            if (!string.IsNullOrEmpty(t.DeadlineAnchor)
                && settingDates.TryGetValue(t.DeadlineAnchor, out var sd) && sd.HasValue)
                due = sd; // the live anchored date wins when set
            result[t.Id] = due;
        }
        return result;
    }
}
