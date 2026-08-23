using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// Live PROGRESS signals — the fixed catalog of module-state indicators a rentrée task can reflect. When a
// template/task has a ProgressKey, its row shows the real state of the underlying work (a count or a boolean)
// instead of a manual checkbox, and AUTO-SATISFIES when the work is complete (which unblocks dependents and
// counts toward the phase progress) — so the checklist stops relying on someone remembering to tick a box.
//
// Two shapes: group-wide (one value for the whole group, on a group task) and per-unit (a value per unit, on a
// fanned-out task — each instance reads its own UnitId). Computed on read; nothing is persisted.
// Keep in sync with the frontend catalog in client/src/lib/rentree-progress.ts.
public static class RentreeProgress
{
    // The computed state of one task's progress signal. Current/Total drive a bar (null for booleans);
    // Complete = the work is done (auto-satisfies the task); Label = the compact French chip text.
    public sealed record State(int? Current, int? Total, bool Complete, string Label);

    // key → (editor label, per-unit?). Per-unit keys read the task's UnitId (pair them with "une tâche par unité").
    public static readonly IReadOnlyList<(string Key, string Label, bool PerUnit)> All = new[]
    {
        ("demandes-open", "Inscriptions ouvertes", false),
        ("passage-open", "Passage ouvert", false),
        ("passage-proposed", "Passages proposés — par unité", true),
        ("passage-finalized", "Passages finalisés", false),
        ("demandes-reviewed", "Demandes révisées", false),
        ("demandes-sent", "Réponses envoyées", false),
        ("documents-verified", "Documents vérifiés — par unité", true),
        ("photos-done", "Photos prises — par unité", true),
        ("cotisations-paid", "Cotisations réglées — par unité", true),
    };

    public static readonly HashSet<string> Keys = All.Select(a => a.Key).ToHashSet();
    public static readonly HashSet<string> PerUnitKeys = All.Where(a => a.PerUnit).Select(a => a.Key).ToHashSet();

    public static bool IsValid(string? key) => string.IsNullOrEmpty(key) || Keys.Contains(key);

    // Compute the progress State for every task that carries a (valid) ProgressKey, batched by signal.
    // Group signals are read once; per-unit signals are read for the union of the referenced units' active members.
    public static async Task<Dictionary<Guid, State>> ComputeAsync(
        IApplicationDbContext context, IReadOnlyList<RentreeTask> tasks, string scoutYear, CancellationToken ct)
    {
        var result = new Dictionary<Guid, State>();
        var withProgress = tasks.Where(t => !string.IsNullOrEmpty(t.ProgressKey) && Keys.Contains(t.ProgressKey!)).ToList();
        if (withProgress.Count == 0) return result;
        var present = withProgress.Select(t => t.ProgressKey!).ToHashSet();

        // ── Group-wide signals ──
        State? demandesOpen = null, passageOpen = null, demandesReviewed = null, demandesSent = null, passageFinalized = null;

        if (present.Contains("demandes-open") || present.Contains("passage-open"))
        {
            var flags = await context.Settings.Where(s => s.Key == "demande.enabled" || s.Key == "passage.enabled")
                .Select(s => new { s.Key, s.Value }).ToListAsync(ct);
            var demEn = flags.FirstOrDefault(f => f.Key == "demande.enabled")?.Value == "true";
            var pasEn = flags.FirstOrDefault(f => f.Key == "passage.enabled")?.Value == "true";
            demandesOpen = new State(null, null, demEn, demEn ? "Ouvertes" : "Fermées");
            passageOpen = new State(null, null, pasEn, pasEn ? "Ouvert" : "Fermé");
        }

        if (present.Contains("demandes-reviewed") || present.Contains("demandes-sent"))
        {
            // All non-draft demandes for the year; a decision (Approved/Declined) stages the status while
            // ResponseSentAt stays null until the batch is sent.
            var dem = await context.Demandes.Where(d => d.ScoutYear == scoutYear && d.Status != DemandeStatus.Draft)
                .Select(d => new { d.Status, Sent = d.ResponseSentAt != null }).ToListAsync(ct);
            var totalSubmitted = dem.Count;
            var undecided = dem.Count(d => d.Status == DemandeStatus.Submitted && !d.Sent); // still awaiting a CG decision
            demandesReviewed = new State(totalSubmitted - undecided, totalSubmitted, totalSubmitted > 0 && undecided == 0,
                undecided > 0 ? $"{undecided} à réviser" : totalSubmitted > 0 ? "Toutes révisées" : "Aucune demande");

            var decided = dem.Count(d => d.Status is DemandeStatus.Approved or DemandeStatus.Declined);
            var unsent = dem.Count(d => d.Status is DemandeStatus.Approved or DemandeStatus.Declined && !d.Sent);
            demandesSent = new State(decided - unsent, decided, decided > 0 && unsent == 0,
                unsent > 0 ? $"{unsent} à envoyer" : decided > 0 ? "Envoyées" : "Rien à envoyer");
        }

        if (present.Contains("passage-finalized"))
        {
            var pas = await context.Passages.Where(p => p.ScoutYear == scoutYear).Select(p => p.Status).ToListAsync(ct);
            var finalized = pas.Count(s => s == PassageStatus.Finalized);
            var approvedPending = pas.Count(s => s == PassageStatus.Approved); // approved but not yet finalized
            var actionable = finalized + approvedPending;
            passageFinalized = new State(finalized, actionable, actionable > 0 && approvedPending == 0,
                approvedPending > 0 ? $"{approvedPending} à finaliser" : finalized > 0 ? "Finalisés" : "Aucun passage");
        }

        // ── Per-unit signals ──
        var passageProposed = new Dictionary<Guid, State>();
        var documentsVerified = new Dictionary<Guid, State>();
        var photosDone = new Dictionary<Guid, State>();
        var cotisationsPaid = new Dictionary<Guid, State>();

        var perUnitTasks = withProgress.Where(t => t.UnitId.HasValue && PerUnitKeys.Contains(t.ProgressKey!)).ToList();
        if (perUnitTasks.Count > 0)
        {
            var unitIds = perUnitTasks.Select(t => t.UnitId!.Value).Distinct().ToList();
            // Active members per referenced unit (the canonical EndDate == null pattern).
            var activeByUnit = (await context.MemberAssignments
                    .Where(a => a.EndDate == null && !a.IsDeleted && unitIds.Contains(a.UnitId))
                    .Select(a => new { a.UnitId, a.MemberId }).ToListAsync(ct))
                .GroupBy(a => a.UnitId).ToDictionary(g => g.Key, g => g.Select(x => x.MemberId).Distinct().ToList());
            var allMemberIds = activeByUnit.Values.SelectMany(x => x).Distinct().ToList();

            List<Guid> UnitMembers(Guid u) => activeByUnit.TryGetValue(u, out var l) ? l : [];

            if (present.Contains("passage-proposed"))
            {
                var proposed = (await context.Passages
                        .Where(p => p.ScoutYear == scoutYear && unitIds.Contains(p.CurrentUnitId))
                        .Select(p => new { p.CurrentUnitId, p.MemberId }).ToListAsync(ct))
                    .GroupBy(p => p.CurrentUnitId).ToDictionary(g => g.Key, g => g.Select(x => x.MemberId).Distinct().Count());
                foreach (var u in unitIds)
                {
                    int total = UnitMembers(u).Count, cur = proposed.GetValueOrDefault(u);
                    // total == 0 (empty/placeholder unit) → nothing to do → complete, so it never permanently
                    // blocks a dependent group task (e.g. "Finaliser les passages") or drags phase progress.
                    passageProposed[u] = new State(cur, total, cur >= total, $"{cur}/{total}");
                }
            }

            if (present.Contains("documents-verified"))
            {
                var activeTypeIds = await context.DocumentTypes.Where(dt => dt.IsActive).Select(dt => dt.Id).ToListAsync(ct);
                var pendingMembers = activeTypeIds.Count == 0 || allMemberIds.Count == 0
                    ? new HashSet<Guid>()
                    : (await context.MemberDocuments
                        .Where(d => allMemberIds.Contains(d.MemberId) && activeTypeIds.Contains(d.DocumentTypeId) && d.Status == DocumentStatus.Pending)
                        .Select(d => d.MemberId).Distinct().ToListAsync(ct)).ToHashSet();
                foreach (var u in unitIds)
                {
                    var members = UnitMembers(u);
                    var pend = members.Count(m => pendingMembers.Contains(m)); // members with a doc still awaiting the CU
                    // pend == 0 → complete (an empty unit has nothing pending, so it doesn't block dependents).
                    documentsVerified[u] = new State(members.Count - pend, members.Count, pend == 0,
                        pend > 0 ? $"{pend} à vérifier" : members.Count > 0 ? "Rien en attente" : "0");
                }
            }

            if (present.Contains("photos-done"))
            {
                var withPhoto = allMemberIds.Count == 0
                    ? new HashSet<Guid>()
                    : (await context.Members.Where(m => allMemberIds.Contains(m.Id) && m.PhotoPath != null && m.PhotoPath != "")
                        .Select(m => m.Id).ToListAsync(ct)).ToHashSet();
                foreach (var u in unitIds)
                {
                    var members = UnitMembers(u);
                    var cur = members.Count(m => withPhoto.Contains(m));
                    photosDone[u] = new State(cur, members.Count, cur >= members.Count, $"{cur}/{members.Count}");
                }
            }

            if (present.Contains("cotisations-paid"))
            {
                // A member "committed" for the year = has a MemberCotisation row (a payment line OR a WillNotPay marker).
                var paidMembers = allMemberIds.Count == 0
                    ? new HashSet<Guid>()
                    : (await context.MemberCotisations
                        .Where(c => c.ScoutYear == scoutYear && allMemberIds.Contains(c.MemberId))
                        .Select(c => c.MemberId).Distinct().ToListAsync(ct)).ToHashSet();
                foreach (var u in unitIds)
                {
                    var members = UnitMembers(u);
                    var cur = members.Count(m => paidMembers.Contains(m));
                    cotisationsPaid[u] = new State(cur, members.Count, cur >= members.Count, $"{cur}/{members.Count}");
                }
            }
        }

        // Map each progress-bearing task → its computed state.
        foreach (var t in withProgress)
        {
            State? st = t.ProgressKey switch
            {
                "demandes-open" => demandesOpen,
                "passage-open" => passageOpen,
                "demandes-reviewed" => demandesReviewed,
                "demandes-sent" => demandesSent,
                "passage-finalized" => passageFinalized,
                "passage-proposed" => t.UnitId.HasValue ? passageProposed.GetValueOrDefault(t.UnitId.Value) : null,
                "documents-verified" => t.UnitId.HasValue ? documentsVerified.GetValueOrDefault(t.UnitId.Value) : null,
                "photos-done" => t.UnitId.HasValue ? photosDone.GetValueOrDefault(t.UnitId.Value) : null,
                "cotisations-paid" => t.UnitId.HasValue ? cotisationsPaid.GetValueOrDefault(t.UnitId.Value) : null,
                _ => null,
            };
            if (st != null) result[t.Id] = st;
        }
        return result;
    }
}
