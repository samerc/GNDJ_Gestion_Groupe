using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// ── One-time follow-up to the auto-declare backfill: RE-APPLY the address rules to the "à vérifier" fratries ──
//
// The auto-declare button (AutoDeclareSiblingsCommand) SKIPS any family already fully in one group, so once it has
// run it can never re-evaluate addresses again. If an earlier run happened on a build with FEWER address rules than
// now (e.g. before the one-active-member rule), the families it flagged AddressNeedsReview stay flagged even though
// the current rules could resolve some of them automatically.
//
// This command re-runs ONLY the address decision over the currently-flagged groups, with the FULL current rule set:
//   (1) separated/divorced → leave untouched (manual);
//   (2) exactly ONE active member with an address → use THAT member's (current, maintained) address;
//   (3) near-identical spellings (worst-pair similarity ≥ UnifyThreshold) → the fullest spelling;
//   (4) ALL members unit-less + similar enough (≥ UnitlessUnifyThreshold) → the fullest spelling;
//   else → still genuinely different → keep flagged for the manual reconcile worklist.
// When a rule resolves a group it unifies the household onto the canonical address (update-in-place / soft-delete the
// variants / fill the empties — reversible) and CLEARS the flag. Simulate previews the counts; Apply writes.
//
// Temporary tool (same lifetime as the auto-declare backfill) — remove both after the initial prod run.
public record ReunifyFratrieAddressesCommand(bool Simulate) : IRequest<Result<ReunifyAddressesResultDto>>;

public record ReunifyAddressesResultDto(
    bool Simulated,
    int GroupsFlagged,   // AddressNeedsReview groups examined
    int Resolved,        // now auto-unified → flag cleared
    int StillReview,     // still genuinely different → flag kept
    int Separated);      // separated/divorced → left untouched

public class ReunifyFratrieAddressesCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<ReunifyFratrieAddressesCommand, Result<ReunifyAddressesResultDto>>
{
    // Same thresholds as AutoDeclareSiblingsCommand (kept in lockstep; both are temporary backfill tools).
    private const double UnifyThreshold = 0.95;
    private const double UnitlessUnifyThreshold = 0.70;

    public async ValueTask<Result<ReunifyAddressesResultDto>> Handle(ReunifyFratrieAddressesCommand request, CancellationToken ct)
    {
        // The currently-flagged groups (the "à vérifier — adresse" worklist).
        var flaggedGroupIds = await context.SiblingGroups
            .Where(g => !g.IsDeleted && g.AddressNeedsReview)
            .Select(g => g.Id).ToListAsync(ct);
        if (flaggedGroupIds.Count == 0)
            return Result<ReunifyAddressesResultDto>.Success(new(request.Simulate, 0, 0, 0, 0));

        // Their members, with the active unit name (null = no active assignment) + parents situation.
        var members = await context.Members
            .Where(m => !m.IsDeleted && m.SiblingGroupId != null && flaggedGroupIds.Contains(m.SiblingGroupId!.Value))
            .Select(m => new MRow(
                m.Id, m.SiblingGroupId!.Value,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                m.ParentsSituation))
            .ToListAsync(ct);
        var byGroup = members.GroupBy(m => m.GroupId).ToDictionary(g => g.Key, g => g.ToList());

        var memberIds = members.Select(m => m.Id).ToList();
        var addrRows = await context.MemberAddresses
            .Where(a => memberIds.Contains(a.MemberId))
            .Select(a => new { a.MemberId, a.Country, a.City, a.Details, a.Type })
            .ToListAsync(ct);
        var addrByMember = addrRows.GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(a => new ARow(a.Country ?? "", a.City ?? "", a.Details, a.Type)).ToList());

        // ── Decide per flagged group ──
        var toApply = new List<GroupPlan>();
        int resolved = 0, stillReview = 0, separated = 0;

        foreach (var gid in flaggedGroupIds)
        {
            var mem = byGroup.GetValueOrDefault(gid) ?? [];
            var memIds = mem.Select(m => m.Id).ToList();
            if (memIds.Count < 2) { stillReview++; continue; }                 // a lone/dissolved group → leave as is
            var situationOf = mem.ToDictionary(m => m.Id, m => m.Situation);
            var unitOf = mem.ToDictionary(m => m.Id, m => m.Unit);

            // Separated/divorced → addresses stay manual.
            if (memIds.Any(id => IsSeparated(situationOf[id]))) { separated++; continue; }

            // Gather the family's non-empty addresses + who has none.
            var nonEmpty = new List<ARow>();
            var without = new List<Guid>();
            foreach (var id in memIds)
            {
                var list = addrByMember.GetValueOrDefault(id) ?? [];
                var ne = list.Where(a => !string.IsNullOrWhiteSpace(a.City) || !string.IsNullOrWhiteSpace(a.Details)).ToList();
                if (ne.Count == 0) without.Add(id); else nonEmpty.AddRange(ne);
            }
            var distinctKeys = nonEmpty.Select(AddrKey).Distinct().ToList();
            if (distinctKeys.Count == 0) { stillReview++; continue; }          // nobody has an address → nothing to do

            (string Country, string City, string? Details, string? Type) canonical;
            bool unifyReplace;
            if (distinctKeys.Count == 1)
            {
                // The addresses now AGREE → fill the empties only (never rewrite an existing one). Clear the flag.
                var c = nonEmpty[0];
                canonical = (c.Country, c.City, c.Details, c.Type);
                unifyReplace = false;
            }
            else
            {
                var distinctAddrs = nonEmpty.GroupBy(AddrKey).Select(g => g.First()).ToList();
                var worst = WorstPairSimilarity(distinctAddrs);
                bool allUnitless = memIds.All(id => unitOf[id] == null);
                var activeIds = memIds.Where(id => unitOf[id] != null).ToList();

                // (2) the single active member's own (fullest) address, if there's exactly one active member with one.
                ARow? activeAddr = null;
                if (activeIds.Count == 1)
                {
                    var actList = (addrByMember.GetValueOrDefault(activeIds[0]) ?? [])
                        .Where(a => !string.IsNullOrWhiteSpace(a.City) || !string.IsNullOrWhiteSpace(a.Details)).ToList();
                    if (actList.Count > 0) activeAddr = Fullest(actList);
                }

                if (activeAddr is { } aa)
                {
                    canonical = (aa.Country, aa.City, aa.Details, aa.Type);
                    unifyReplace = true;
                }
                else if (worst >= UnifyThreshold || (allUnitless && worst >= UnitlessUnifyThreshold))
                {
                    var c = Fullest(distinctAddrs);
                    canonical = (c.Country, c.City, c.Details, c.Type);
                    unifyReplace = true;
                }
                else { stillReview++; continue; }                             // still genuinely different → keep flagged
            }

            resolved++;
            toApply.Add(new GroupPlan(gid, memIds, canonical, unifyReplace, without));
        }

        // ── Apply (skipped in simulate) ──
        if (!request.Simulate && toApply.Count > 0)
        {
            await ApplyAsync(toApply, ct);
            await audit.LogAsync("ReunifyFratrieAddresses", "SiblingGroup", null, newValues: new
            {
                Resolues = resolved, ResteAVerifier = stillReview, SeparesIgnores = separated
            }, cancellationToken: ct);
        }

        return Result<ReunifyAddressesResultDto>.Success(new(
            request.Simulate, flaggedGroupIds.Count, resolved, stillReview, separated));
    }

    // Unify each resolved group onto its canonical address + clear its flag, in ONE transaction.
    private async Task ApplyAsync(List<GroupPlan> groups, CancellationToken ct)
    {
        var allMemberIds = groups.SelectMany(g => g.MemberIds).Distinct().ToList();
        var groupIds = groups.Select(g => g.GroupId).ToList();
        await using var tx = await context.BeginTransactionAsync(ct);
        try
        {
            var addrByMember = (await context.MemberAddresses.Where(a => allMemberIds.Contains(a.MemberId)).ToListAsync(ct))
                .GroupBy(a => a.MemberId).ToDictionary(g => g.Key, g => g.ToList());
            var trackedGroups = (await context.SiblingGroups.Where(g => groupIds.Contains(g.Id)).ToListAsync(ct))
                .ToDictionary(g => g.Id);

            foreach (var plan in groups)
            {
                var uc = plan.Canonical;
                if (plan.UnifyReplace)
                {
                    // Near-identical spellings of one home → set the fullest onto EVERY sibling. A sibling with rows:
                    // update the first in place + soft-delete the extras (variants of the same home). None: add it.
                    // Inserted straight through the DbSet with the FK — never mutate a member's tracked nav collection
                    // (that triggers a spurious parent UPDATE / DbUpdateConcurrencyException).
                    foreach (var mid in plan.MemberIds)
                    {
                        var existing = (addrByMember.GetValueOrDefault(mid) ?? [])
                            .Where(a => !string.IsNullOrWhiteSpace(a.City) || !string.IsNullOrWhiteSpace(a.Details)).ToList();
                        if (existing.Count == 0)
                        {
                            context.MemberAddresses.Add(new MemberAddress
                            {
                                MemberId = mid,
                                Type = string.IsNullOrWhiteSpace(uc.Type) ? "Domicile" : uc.Type!,
                                Country = uc.Country, City = uc.City, Details = uc.Details, IsPrimary = true
                            });
                        }
                        else
                        {
                            var first = existing[0];
                            first.Country = uc.Country; first.City = uc.City; first.Details = uc.Details;
                            if (string.IsNullOrWhiteSpace(first.Type)) first.Type = string.IsNullOrWhiteSpace(uc.Type) ? "Domicile" : uc.Type!;
                            foreach (var extra in existing.Skip(1)) context.MemberAddresses.Remove(extra); // soft-deleted
                        }
                    }
                }
                else
                {
                    // Addresses agree → only fill the siblings who have NONE (never touch an existing address).
                    foreach (var mid in plan.MembersWithoutAddress)
                        context.MemberAddresses.Add(new MemberAddress
                        {
                            MemberId = mid,
                            Type = string.IsNullOrWhiteSpace(uc.Type) ? "Domicile" : uc.Type!,
                            Country = uc.Country, City = uc.City, Details = uc.Details, IsPrimary = true
                        });
                }

                if (trackedGroups.TryGetValue(plan.GroupId, out var g)) g.AddressNeedsReview = false;
            }

            await context.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    // ── Copied verbatim from AutoDeclareSiblingsCommand so the two backfill tools stay in exact lockstep ──
    private static bool IsSeparated(string? situation)
    {
        var k = TextNormalization.NormalizeKey(situation ?? "");
        return k.Contains("separ") || k.Contains("divorc");
    }

    private static string AddrKey(ARow a) =>
        TextNormalization.NormalizeKey(a.City) + "|" + TextNormalization.NormalizeKey(a.Details ?? "") + "|" + TextNormalization.NormalizeKey(a.Country);

    private static double WorstPairSimilarity(List<ARow> addrs)
    {
        double worst = 1.0;
        for (int i = 0; i < addrs.Count; i++)
            for (int j = i + 1; j < addrs.Count; j++)
                worst = Math.Min(worst, Similarity(AddrText(addrs[i]), AddrText(addrs[j])));
        return worst;
    }

    private static ARow Fullest(List<ARow> addrs) => addrs
        .OrderByDescending(a => (string.IsNullOrWhiteSpace(a.City) ? 0 : 1) + (string.IsNullOrWhiteSpace(a.Details) ? 0 : 1))
        .ThenByDescending(a => ((a.City ?? "") + (a.Details ?? "")).Length)
        .First();

    private static string AddrText(ARow a) =>
        (TextNormalization.NormalizeKey(a.City) + " " + TextNormalization.NormalizeKey(a.Details ?? "")).Trim();

    private static double Similarity(string a, string b)
    {
        if (a == b) return 1.0;
        int max = Math.Max(a.Length, b.Length);
        if (max == 0) return 1.0;
        return 1.0 - (double)Levenshtein(a, b) / max;
    }

    private static int Levenshtein(string a, string b)
    {
        if (a.Length == 0) return b.Length;
        if (b.Length == 0) return a.Length;
        var prev = new int[b.Length + 1];
        var cur = new int[b.Length + 1];
        for (int j = 0; j <= b.Length; j++) prev[j] = j;
        for (int i = 1; i <= a.Length; i++)
        {
            cur[0] = i;
            for (int j = 1; j <= b.Length; j++)
            {
                int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                cur[j] = Math.Min(Math.Min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + cost);
            }
            (prev, cur) = (cur, prev);
        }
        return prev[b.Length];
    }

    private sealed record MRow(Guid Id, Guid GroupId, string? Unit, string? Situation);
    private sealed record ARow(string Country, string City, string? Details, string? Type);
    private sealed record GroupPlan(Guid GroupId, List<Guid> MemberIds,
        (string Country, string City, string? Details, string? Type) Canonical, bool UnifyReplace, List<Guid> MembersWithoutAddress);
}
