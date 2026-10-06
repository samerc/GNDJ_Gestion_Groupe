using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// The fixed catalog of built-in actions that can be attached to a rentrée task (in the template editor).
// Two kinds:
//   - "do" actions run a real operation from the checklist (server-side) and auto-complete the task.
//   - "goto-*" actions are pure client-side navigation shortcuts (no server work) — listed here only so
//     the ActionKey is validated as a known value.
// Keep this in sync with the frontend catalog in client/src/lib/rentree-actions.ts.
public static class RentreeActions
{
    // Executable server-side actions (open a process from the checklist).
    public const string OpenDemandes = "open-demandes";   // demande.enabled = true
    public const string OpenPassage = "open-passage";     // passage.enabled = true

    // The executable "do" actions.
    public static readonly HashSet<string> DoActions = new() { OpenDemandes, OpenPassage };

    // Navigation shortcuts (frontend routes). No server behaviour.
    public static readonly HashSet<string> GotoActions = new()
    {
        "goto-settings", "goto-units", "goto-maitrises", "goto-demandes", "goto-passage",
        "goto-passage-review", "goto-documents", "goto-photo", "goto-my-unit", "goto-progression",
        "goto-communications", "goto-document-reminders", "goto-documents-suivi",
        "goto-email", "goto-demande-archives", "goto-document-types", RentreeFeatureGates.Cards,
    };

    // All valid ActionKey values (null/empty = no action).
    public static bool IsValid(string? key) =>
        string.IsNullOrEmpty(key) || DoActions.Contains(key) || GotoActions.Contains(key);
}

// Tasks tied to a feature that can be switched off in Paramètres. While the feature is off, its tasks are hidden
// from the checklist (page, « Mes tâches », overdue popup, weekly reminders, dashboard count) and count as done for
// the tasks that depend on them, so nothing waits on them. Switching the feature back on shows them again with
// their progress intact. Keyed by the task's ActionKey (set in the template editor).
public static class RentreeFeatureGates
{
    public const string Cards = "goto-cards"; // member cards — setting reports.cards_enabled

    private static readonly Dictionary<string, string> SettingByAction = new() { [Cards] = "reports.cards_enabled" };

    // The action keys whose feature is currently OFF (a missing setting counts as on).
    public static async Task<HashSet<string>> OffActionsAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var keys = SettingByAction.Values.Distinct().ToList();
        var values = await context.Settings.Where(x => keys.Contains(x.Key)).ToDictionaryAsync(x => x.Key, x => x.Value, ct);
        return SettingByAction
            .Where(kv => values.TryGetValue(kv.Value, out var v) && string.Equals(v?.Trim(), "false", StringComparison.OrdinalIgnoreCase))
            .Select(kv => kv.Key).ToHashSet();
    }

    public static bool IsOff(RentreeTask task, HashSet<string> off) => task.ActionKey is { } k && off.Contains(k);
}
