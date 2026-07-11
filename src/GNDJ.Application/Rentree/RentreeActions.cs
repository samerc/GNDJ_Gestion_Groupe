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
    };

    // All valid ActionKey values (null/empty = no action).
    public static bool IsValid(string? key) =>
        string.IsNullOrEmpty(key) || DoActions.Contains(key) || GotoActions.Contains(key);
}
