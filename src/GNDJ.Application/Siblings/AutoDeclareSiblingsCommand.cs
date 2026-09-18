using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// ── One-time backfill: auto-declare the "obvious" fratries — members who share the EXACT SAME parent record ──
//
// This is the high-confidence tier: two members linked to the *same* guardian record are siblings with near
// certainty (you can't share a physical parent record by accident). The data is clean (the biggest shared guardian
// links only 5 members — real large families, no bogus mega-family), so we can declare these in bulk WITHOUT the
// CG reviewing each. It's a temporary tool — run once (Simulate first to preview, then Apply); going forward new
// families are declared as they form (demande conversion / manual guardian-link).
//
// Only the "share a guardian record" signal is used (NOT the fuzzy phone/email/name signals the suggestion engine
// also uses — those catch DUPLICATE parent records and need the CG's merge, so they stay in the review flow).
//
// Addresses: a fratrie should have one household, but there's no human here to pick which address is canonical, so
// we only auto-unify when it's unambiguous. Three cases: (1) the family's addresses AGREE (same normalized
// city+street+building) → fill the empties (additive). (2) they're NEAR-IDENTICAL spelling/format variants of one
// home (worst-pair similarity ≥ UnifyThreshold, e.g. "5ème"/"5", "Bldg"/"building", "Rue X"/"X" — Lebanese place
// names have no standard spelling) → auto-unify: set the fullest (most complete) spelling on every sibling
// (replaces the variants; reversible soft-delete). A family whose members are ALL unit-less (inactive/alumni)
// auto-unifies at a LOOSER bar (UnitlessUnifyThreshold) since the address is low-stakes there; and a family with
// exactly ONE active member (the rest anciens) uses THAT member's own address (the current, maintained household)
// regardless of similarity. (3) they GENUINELY differ → we DON'T guess, we flag the group (AddressNeedsReview) for
// the CG to open the reconcile wizard and pick. Separated/divorced families skip addresses entirely (handled manually).
public record AutoDeclareSiblingsCommand(bool Simulate) : IRequest<Result<AutoDeclareSiblingsResultDto>>;

// The CG-only note stamped on auto-created groups (never shown to members).
public static class AutoSiblingNote
{
    public const string Value = "Détectée automatiquement (parents partagés)";
}

public class AutoDeclareSiblingsCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<AutoDeclareSiblingsCommand, Result<AutoDeclareSiblingsResultDto>>
{
    private const int GuardianBucketCap = 15;   // a guardian linked to >15 members is bad data, not a family
    private const int PreviewCap = 300;          // families detailed in the preview (counts are always the true total)
    // Worst-pair address similarity (0-1) at/above which differing addresses are treated as spelling variants of
    // ONE home and auto-unified (onto the fullest spelling) instead of sent to review. Conservative on purpose:
    // ≥0.95 = essentially the same address (verified on the real data). Lower it to widen the auto-unify net.
    private const double UnifyThreshold = 0.95;
    // Relaxed threshold used ONLY when EVERY member of the family is unit-less (no active assignment = inactive /
    // alumni). For those the address is low-stakes, so a looser "similar enough" bar auto-picks the fullest spelling
    // instead of adding to the review worklist. Still excludes genuinely-different addresses (two towns score < 0.6).
    private const double UnitlessUnifyThreshold = 0.70;

    public async ValueTask<Result<AutoDeclareSiblingsResultDto>> Handle(AutoDeclareSiblingsCommand request, CancellationToken ct)
    {
        // ── Load the lean data the analysis needs (no tracking — we re-load tracked entities only to apply) ──
        var members = await context.Members
            .Where(m => !m.IsDeleted)
            .Select(m => new MRow(m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                m.SiblingGroupId, m.ParentsSituation))
            .ToListAsync(ct);
        var byId = members.ToDictionary(m => m.Id);

        // guardian_links → the members each guardian record is attached to (only known, non-deleted members).
        var links = await context.GuardianLinks
            .Where(l => !l.Member.IsDeleted && !l.Guardian.IsDeleted)
            .Select(l => new { l.MemberId, l.GuardianId, GFirst = l.Guardian.FirstName, GLast = l.Guardian.LastName })
            .ToListAsync(ct);
        var guardianMembers = links.GroupBy(l => l.GuardianId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.MemberId).Where(byId.ContainsKey).Distinct().ToList());
        var guardianName = links.GroupBy(l => l.GuardianId)
            .ToDictionary(g => g.Key, g => $"{g.First().GFirst} {g.First().GLast}".Trim());

        // Member addresses (for the agree/differ address analysis).
        var addrRows = await context.MemberAddresses
            .Select(a => new { a.MemberId, a.Country, a.City, a.Details, a.Type })
            .ToListAsync(ct);
        var addrByMember = addrRows.GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(a => new ARow(a.Country ?? "", a.City ?? "", a.Details, a.Type)).ToList());

        var rejected = (await context.SiblingRejections.Select(r => new { r.MemberAId, r.MemberBId }).ToListAsync(ct))
            .Select(r => SiblingUtil.Pair(r.MemberAId, r.MemberBId)).ToHashSet();

        // ── Build the shared-guardian edges, then union-find into families ──
        var edges = new List<(Guid a, Guid b, string parent)>();
        foreach (var (gid, mem) in guardianMembers)
        {
            if (mem.Count < 2 || mem.Count > GuardianBucketCap) continue;   // skip singletons + bad-data mega-buckets
            var name = guardianName.GetValueOrDefault(gid, "?");
            for (int i = 0; i < mem.Count; i++)
                for (int j = i + 1; j < mem.Count; j++)
                {
                    var (a, b) = SiblingUtil.Pair(mem[i], mem[j]);
                    if (!rejected.Contains((a, b))) edges.Add((a, b, name));   // a CG "not siblings" tombstone splits the edge
                }
        }

        var dsu = new Dsu();
        foreach (var e in edges) dsu.Union(e.a, e.b);
        var compMembers = new Dictionary<Guid, HashSet<Guid>>();
        var compParents = new Dictionary<Guid, HashSet<string>>();
        foreach (var e in edges)
        {
            var r = dsu.Find(e.a);
            (compMembers.TryGetValue(r, out var ms) ? ms : compMembers[r] = new()).Add(e.a);
            compMembers[r].Add(e.b);
            (compParents.TryGetValue(r, out var ps) ? ps : compParents[r] = new()).Add(e.parent);
        }

        // ── Turn each component into a decision (what would be declared + the address verdict) ──
        var decisions = new List<FamilyDecision>();
        foreach (var (root, mset) in compMembers)
        {
            if (mset.Count < 2) continue;
            var groupIds = mset.Select(id => byId[id].GroupId).ToList();
            // Already ONE confirmed group covering the whole family → nothing to do.
            if (groupIds.All(g => g != null) && groupIds.Distinct().Count() == 1) continue;

            var memIds = mset.ToList();
            var groupAction = groupIds.Any(g => g != null) ? "extended" : "new";

            // Separated/divorced → declare the group but leave addresses to manual handling.
            bool separated = memIds.Any(id => IsSeparated(byId[id].Situation));

            // Address verdict: gather the family's non-empty addresses + their normalized keys.
            var nonEmpty = new List<ARow>();
            var withoutAddress = new List<Guid>();
            foreach (var id in memIds)
            {
                var list = addrByMember.GetValueOrDefault(id) ?? [];
                var ne = list.Where(a => !string.IsNullOrWhiteSpace(a.City) || !string.IsNullOrWhiteSpace(a.Details)).ToList();
                if (ne.Count == 0) withoutAddress.Add(id); else nonEmpty.AddRange(ne);
            }
            var distinctKeys = nonEmpty.Select(AddrKey).Distinct().ToList();

            string addressStatus;
            bool unifyReplace = false;                                              // overwrite the variants onto the fullest
            (string Country, string City, string? Details, string? Type)? canonical = null;
            if (separated) addressStatus = "separated";
            else if (distinctKeys.Count == 0) addressStatus = "none";              // nobody has an address
            else if (distinctKeys.Count == 1)
            {
                addressStatus = withoutAddress.Count > 0 ? "agree" : "none";        // one home → fill the empties (else nothing to do)
                var c = nonEmpty[0];
                canonical = (c.Country, c.City, c.Details, c.Type);
            }
            else
            {
                // Differing keys. Resolve automatically in three cases, else leave it to the CG (review):
                //  (4) exactly ONE member is active (the rest are anciens) → the active member's address is the
                //      current, maintained household → use IT for the whole family (authoritative, any similarity);
                //  (2) near-identical spellings of one home (worst-pair ≥ UnifyThreshold) → fullest;
                //  (3) ALL members unit-less (inactive/alumni, low-stakes) + similar enough → fullest.
                var distinctAddrs = nonEmpty.GroupBy(AddrKey).Select(g => g.First()).ToList();
                var worst = WorstPairSimilarity(distinctAddrs);
                bool allUnitless = memIds.All(id => byId[id].Unit == null);         // no visible active assignment

                // (4) the single active member's own (fullest) address, if there's exactly one active member with one.
                var activeIds = memIds.Where(id => byId[id].Unit != null).ToList();
                ARow? activeAddr = null;
                if (activeIds.Count == 1)
                {
                    var actList = (addrByMember.GetValueOrDefault(activeIds[0]) ?? [])
                        .Where(a => !string.IsNullOrWhiteSpace(a.City) || !string.IsNullOrWhiteSpace(a.Details)).ToList();
                    if (actList.Count > 0) activeAddr = Fullest(actList);
                }

                if (activeAddr is { } aa)
                {
                    addressStatus = "agree"; unifyReplace = true;                    // use the active member's address
                    canonical = (aa.Country, aa.City, aa.Details, aa.Type);
                }
                else if (worst >= UnifyThreshold || (allUnitless && worst >= UnitlessUnifyThreshold))
                {
                    addressStatus = "agree";                                        // counts as "unified" in the preview
                    unifyReplace = true;
                    var c = Fullest(distinctAddrs);
                    canonical = (c.Country, c.City, c.Details, c.Type);
                }
                else addressStatus = "review";                                      // genuinely differ → CG picks
            }

            decisions.Add(new FamilyDecision(memIds, compParents[root].OrderBy(x => x).Take(4).ToList(),
                groupAction, addressStatus, withoutAddress, canonical, unifyReplace));
        }

        // ── Counts (always the true totals) ──
        int newGroups = decisions.Count(d => d.GroupAction == "new");
        int extended = decisions.Count(d => d.GroupAction == "extended");
        int addressAgree = decisions.Count(d => d.AddressStatus == "agree");
        int addressReview = decisions.Count(d => d.AddressStatus == "review");
        int separatedSkipped = decisions.Count(d => d.AddressStatus == "separated");
        int membersTotal = decisions.SelectMany(d => d.MemberIds).Distinct().Count();

        // Preview (capped): biggest families first so the CG eyeballs the interesting ones.
        var preview = decisions
            .OrderByDescending(d => d.MemberIds.Count)
            .Take(PreviewCap)
            .Select(d => new AutoDeclareFamilyDto(
                d.MemberIds.Select(id => byId[id])
                    .OrderBy(m => m.Dob ?? DateOnly.MaxValue).ThenBy(m => m.Last).ThenBy(m => m.First)
                    .Select(m => new SiblingCandidateMemberDto(m.Id, m.First, m.Last, m.Dob, m.Photo, m.Unit, m.GroupId))
                    .ToList(),
                d.SharedParents, d.GroupAction, d.AddressStatus))
            .ToList();

        // ── Apply (skipped in simulate) ──
        if (!request.Simulate && decisions.Count > 0)
        {
            await ApplyAsync(decisions, ct);
            await audit.LogAsync("AutoDeclareSiblings", "SiblingGroup", null, newValues: new
            {
                Familles = decisions.Count, Membres = membersTotal,
                NouveauxGroupes = newGroups, GroupesEtendus = extended,
                AdresseUnifiee = addressAgree, AdresseAVerifier = addressReview, SeparesIgnores = separatedSkipped
            }, cancellationToken: ct);
        }

        return Result<AutoDeclareSiblingsResultDto>.Success(new AutoDeclareSiblingsResultDto(
            request.Simulate, decisions.Count, membersTotal, newGroups, extended,
            addressAgree, addressReview, separatedSkipped, preview));
    }

    // Persist the decisions in ONE transaction: create/extend the groups, stamp the auto note on new ones, fill
    // empty addresses where the family agrees, flag the ones whose addresses differ.
    private async Task ApplyAsync(List<FamilyDecision> decisions, CancellationToken ct)
    {
        var affectedIds = decisions.SelectMany(d => d.MemberIds).Distinct().ToList();
        await using var tx = await context.BeginTransactionAsync(ct);
        try
        {
            var tracked = await context.Members.Where(m => affectedIds.Contains(m.Id)).ToListAsync(ct);
            var byId = tracked.ToDictionary(m => m.Id);
            var existingGroupIds = tracked.Where(m => m.SiblingGroupId != null).Select(m => m.SiblingGroupId!.Value).Distinct().ToList();
            var groupsById = (await context.SiblingGroups.Where(g => existingGroupIds.Contains(g.Id)).ToListAsync(ct))
                .ToDictionary(g => g.Id);

            // Load the tracked addresses of the unify (near-identical) families' members — we normalize every
            // sibling onto the fullest spelling (update-in-place / soft-delete extras).
            var unifyMemberIds = decisions.Where(d => d.UnifyReplace).SelectMany(d => d.MemberIds).Distinct().ToList();
            var addrByMember = (await context.MemberAddresses.Where(a => unifyMemberIds.Contains(a.MemberId)).ToListAsync(ct))
                .GroupBy(a => a.MemberId).ToDictionary(g => g.Key, g => g.ToList());

            foreach (var d in decisions)
            {
                var fam = d.MemberIds.Select(id => byId[id]).ToList();
                var famGroupIds = fam.Where(m => m.SiblingGroupId != null).Select(m => m.SiblingGroupId!.Value).Distinct().ToList();

                SiblingGroup keeper;
                if (famGroupIds.Count > 0)
                {
                    keeper = groupsById[famGroupIds[0]];
                    // Family spans >1 existing group → merge the others into the keeper (move ALL their members).
                    if (famGroupIds.Count > 1)
                    {
                        var others = famGroupIds.Skip(1).ToList();
                        var toMove = await context.Members
                            .Where(m => m.SiblingGroupId != null && others.Contains(m.SiblingGroupId!.Value)).ToListAsync(ct);
                        foreach (var m in toMove) m.SiblingGroupId = keeper.Id;
                        var emptied = await context.SiblingGroups.Where(g => others.Contains(g.Id)).ToListAsync(ct);
                        context.SiblingGroups.RemoveRange(emptied);
                    }
                }
                else
                {
                    keeper = new SiblingGroup { Notes = AutoSiblingNote.Value };
                    context.SiblingGroups.Add(keeper);
                }

                foreach (var m in fam) m.SiblingGroupId = keeper.Id;

                if (d.AddressStatus == "review") keeper.AddressNeedsReview = true;
                else if (d.UnifyReplace && d.Canonical is { } uc)
                {
                    // Near-identical spellings of one home → set the fullest onto EVERY sibling. For a sibling who
                    // already has address rows, update the first in place to the canonical + soft-delete any extras
                    // (they're all variants of the same home); a sibling with none gets it added. Reversible.
                    foreach (var mid in d.MemberIds)
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
                else if (d.AddressStatus == "agree" && d.Canonical is { } c)
                {
                    // Fill-only-if-empty: copy the family's one home onto siblings who have NO address (never touch
                    // an existing one). Inserted straight through the DbSet with the FK — we never mutate a member's
                    // tracked Addresses nav (that triggers a spurious parent UPDATE / DbUpdateConcurrencyException).
                    foreach (var mid in d.MembersWithoutAddress)
                        context.MemberAddresses.Add(new MemberAddress
                        {
                            MemberId = mid,
                            Type = string.IsNullOrWhiteSpace(c.Type) ? "Domicile" : c.Type!,
                            Country = c.Country, City = c.City, Details = c.Details, IsPrimary = true
                        });
                }
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

    private static bool IsSeparated(string? situation)
    {
        var k = TextNormalization.NormalizeKey(situation ?? "");
        return k.Contains("separ") || k.Contains("divorc");
    }

    // Same normalized address key the reconcile wizard uses (accent/case/punctuation-insensitive city+street+country).
    private static string AddrKey(ARow a) =>
        TextNormalization.NormalizeKey(a.City) + "|" + TextNormalization.NormalizeKey(a.Details ?? "") + "|" + TextNormalization.NormalizeKey(a.Country);

    // ── Address similarity + "fullest" helpers (near-identical spelling variants → auto-unify) ──

    // Worst (minimum) pairwise similarity across the family's distinct addresses (1.0 for a single address).
    private static double WorstPairSimilarity(List<ARow> addrs)
    {
        double worst = 1.0;
        for (int i = 0; i < addrs.Count; i++)
            for (int j = i + 1; j < addrs.Count; j++)
                worst = Math.Min(worst, Similarity(AddrText(addrs[i]), AddrText(addrs[j])));
        return worst;
    }

    // The "fullest" (most complete) address: most non-empty fields, then the longest text — the spelling to keep.
    private static ARow Fullest(List<ARow> addrs) => addrs
        .OrderByDescending(a => (string.IsNullOrWhiteSpace(a.City) ? 0 : 1) + (string.IsNullOrWhiteSpace(a.Details) ? 0 : 1))
        .ThenByDescending(a => ((a.City ?? "") + (a.Details ?? "")).Length)
        .First();

    // Normalized comparison text for an address (accent/case-insensitive city + street/building).
    private static string AddrText(ARow a) =>
        (TextNormalization.NormalizeKey(a.City) + " " + TextNormalization.NormalizeKey(a.Details ?? "")).Trim();

    // Character-level similarity ratio (1 - Levenshtein/maxLen), 0..1.
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

    private sealed record MRow(Guid Id, string First, string Last, DateOnly? Dob, string? Photo, string? Unit, Guid? GroupId, string? Situation);
    private sealed record ARow(string Country, string City, string? Details, string? Type);
    private sealed record FamilyDecision(List<Guid> MemberIds, List<string> SharedParents, string GroupAction,
        string AddressStatus, List<Guid> MembersWithoutAddress, (string Country, string City, string? Details, string? Type)? Canonical,
        bool UnifyReplace = false);

    // Tiny union-find (disjoint-set) with path compression, keyed by member Guid.
    private sealed class Dsu
    {
        private readonly Dictionary<Guid, Guid> _parent = new();
        public Guid Find(Guid x)
        {
            if (!_parent.ContainsKey(x)) { _parent[x] = x; return x; }
            var root = x;
            while (_parent[root] != root) root = _parent[root];
            while (_parent[x] != root) { var next = _parent[x]; _parent[x] = root; x = next; }
            return root;
        }
        public void Union(Guid a, Guid b) { var ra = Find(a); var rb = Find(b); if (ra != rb) _parent[ra] = rb; }
    }
}

// Result of the auto-declare backfill. In Simulate mode nothing is written — the counts + preview show what WOULD
// happen; the CG then re-runs with Simulate=false to Apply.
public record AutoDeclareSiblingsResultDto(
    bool Simulated,
    int FamiliesTotal,       // families (≥2 members) that would be declared/extended
    int MembersTotal,        // distinct members across those families
    int NewGroups,           // families with no existing declared member → a brand-new group
    int ExtendedGroups,      // families where some member was already declared → fold in / merge
    int AddressAgree,        // families whose addresses agree → empties filled with the family home
    int AddressReview,       // families whose addresses differ → flagged for the CG to pick (à vérifier)
    int SeparatedSkipped,    // separated/divorced families → addresses left untouched (manual)
    IReadOnlyList<AutoDeclareFamilyDto> Preview);

public record AutoDeclareFamilyDto(
    IReadOnlyList<SiblingCandidateMemberDto> Members,
    IReadOnlyList<string> SharedParents,
    string GroupAction,      // "new" | "extended"
    string AddressStatus);   // "agree" | "review" | "separated" | "none"
