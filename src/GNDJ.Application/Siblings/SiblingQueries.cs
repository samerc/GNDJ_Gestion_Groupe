using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// ── Suggestion engine: propose candidate fratries (families) the CG can approve/reject ──
//
// Signals (each contributes candidate PAIRS = edges, with evidence + confidence):
//   • shared guardian record            → "Parent commun : …"          (Élevée)
//   • guardians with the same phone      → "Même téléphone parent : …"  (Élevée)  — catches DUPLICATE parent records
//   • guardians with the same email      → "Même email parent : …"      (Élevée)  — same
//   • same last name + same street       → "Même nom + adresse : …"     (Moyenne)
// Rejected pairs (tombstones) and pairs already in the SAME confirmed group are dropped from the edge list, then
// the remaining edges are unioned (connected components) into families. Filtering at the EDGE level means a
// rejected pair cleanly splits a family. Buckets are size-capped to avoid combinatorial blow-up / bogus mega-
// families from generic data; over-cap buckets are skipped (a deliberate, documented recall trade-off).
public record GetSiblingSuggestionsQuery : IRequest<IReadOnlyList<SiblingSuggestionDto>>;

public class GetSiblingSuggestionsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetSiblingSuggestionsQuery, IReadOnlyList<SiblingSuggestionDto>>
{
    private const int GuardianBucketCap = 15;   // a guardian linked to >15 members is bad data, not a family
    private const int ContactBucketCap = 15;
    private const int AddressBucketCap = 12;
    private const int MaxSuggestions = 200;      // keep the review page manageable

    public async ValueTask<IReadOnlyList<SiblingSuggestionDto>> Handle(GetSiblingSuggestionsQuery request, CancellationToken ct)
    {
        // Lean load of everything the signals need.
        var members = await context.Members
            .Where(m => !m.IsDeleted)
            .Select(m => new SiblingCandidateMemberDto(m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(), m.SiblingGroupId))
            .ToListAsync(ct);
        var memberById = members.ToDictionary(m => m.MemberId);

        var links = await context.GuardianLinks
            .Where(l => !l.Member.IsDeleted)
            .Select(l => new { l.MemberId, l.GuardianId, GFirst = l.Guardian.FirstName, GLast = l.Guardian.LastName })
            .ToListAsync(ct);
        var gPhones = await context.GuardianPhones.Select(p => new { p.GuardianId, p.Number }).ToListAsync(ct);
        var gEmails = await context.GuardianEmails.Select(e => new { e.GuardianId, e.Address }).ToListAsync(ct);
        var addrs = await context.MemberAddresses.Select(a => new { a.MemberId, a.City, a.Details, a.IsPrimary }).ToListAsync(ct);

        var rejected = (await context.SiblingRejections.Select(r => new { r.MemberAId, r.MemberBId }).ToListAsync(ct))
            .Select(r => SiblingUtil.Pair(r.MemberAId, r.MemberBId)).ToHashSet();

        // guardian → its members (distinct, only known members)
        var guardianMembers = links
            .GroupBy(l => l.GuardianId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.MemberId).Where(memberById.ContainsKey).Distinct().ToList());
        var guardianName = links.GroupBy(l => l.GuardianId)
            .ToDictionary(g => g.Key, g => $"{g.First().GFirst} {g.First().GLast}".Trim());

        var edges = new List<(Guid a, Guid b, string ev, bool high)>();

        void EmitPairs(IReadOnlyList<Guid> mem, int cap, string ev, bool high)
        {
            if (mem.Count < 2 || mem.Count > cap) return;
            for (int i = 0; i < mem.Count; i++)
                for (int j = i + 1; j < mem.Count; j++)
                    edges.Add((mem[i], mem[j], ev, high));
        }

        // Signal 1 — shared guardian record.
        foreach (var (gid, mem) in guardianMembers)
            EmitPairs(mem, GuardianBucketCap, $"Parent commun : {guardianName.GetValueOrDefault(gid, "?")}", true);

        // Signal 2 — guardians sharing a phone number (duplicate parent records across siblings).
        foreach (var pg in gPhones.Where(p => SiblingUtil.Digits(p.Number).Length >= 6).GroupBy(p => SiblingUtil.Digits(p.Number)))
        {
            var mem = pg.SelectMany(p => guardianMembers.GetValueOrDefault(p.GuardianId) ?? []).Distinct().ToList();
            EmitPairs(mem, ContactBucketCap, $"Même téléphone parent : {pg.First().Number}", true);
        }

        // Signal 3 — guardians sharing an email.
        foreach (var eg in gEmails.Where(e => SiblingUtil.NormEmail(e.Address).Length > 0).GroupBy(e => SiblingUtil.NormEmail(e.Address)))
        {
            var mem = eg.SelectMany(e => guardianMembers.GetValueOrDefault(e.GuardianId) ?? []).Distinct().ToList();
            EmitPairs(mem, ContactBucketCap, $"Même email parent : {eg.First().Address}", true);
        }

        // Signal 4 — same last name + same street (require specific details, not just a city, to stay precise).
        var primaryAddr = addrs
            .GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(a => a.IsPrimary).First());
        var addrGroups = members
            .Where(m => !string.IsNullOrWhiteSpace(m.LastName) && primaryAddr.TryGetValue(m.MemberId, out var a)
                        && !string.IsNullOrWhiteSpace(a.City) && !string.IsNullOrWhiteSpace(a.Details))
            .GroupBy(m => (TextNormalization.NormalizeKey(m.LastName),
                           TextNormalization.NormalizeKey(primaryAddr[m.MemberId].City),
                           TextNormalization.NormalizeKey(primaryAddr[m.MemberId].Details ?? "")));
        foreach (var g in addrGroups)
        {
            var mem = g.Select(m => m.MemberId).Distinct().ToList();
            var sample = g.First();
            EmitPairs(mem, AddressBucketCap, $"Même nom + adresse : {sample.LastName}, {primaryAddr[sample.MemberId].City}", false);
        }

        // Drop rejected pairs + pairs already grouped together, then union-find into families.
        bool SameConfirmed(Guid a, Guid b) =>
            memberById.TryGetValue(a, out var ma) && memberById.TryGetValue(b, out var mb)
            && ma.SiblingGroupId != null && ma.SiblingGroupId == mb.SiblingGroupId;

        var kept = edges.Where(e => e.a != e.b
                                    && !rejected.Contains(SiblingUtil.Pair(e.a, e.b))
                                    && !SameConfirmed(e.a, e.b)).ToList();

        var dsu = new Dsu();
        foreach (var e in kept) dsu.Union(e.a, e.b);

        var compMembers = new Dictionary<Guid, HashSet<Guid>>();
        var compEvidence = new Dictionary<Guid, HashSet<string>>();
        var compHigh = new Dictionary<Guid, bool>();
        foreach (var e in kept)
        {
            var r = dsu.Find(e.a);
            (compMembers.TryGetValue(r, out var ms) ? ms : compMembers[r] = new()).Add(e.a);
            compMembers[r].Add(e.b);
            (compEvidence.TryGetValue(r, out var ev) ? ev : compEvidence[r] = new()).Add(e.ev);
            if (e.high) compHigh[r] = true;
        }

        var suggestions = new List<SiblingSuggestionDto>();
        foreach (var (root, mset) in compMembers)
        {
            if (mset.Count < 2) continue;
            // Skip if the whole cluster is already one confirmed group (nothing to do).
            var groupIds = mset.Select(id => memberById[id].SiblingGroupId).ToList();
            if (groupIds.All(g => g != null) && groupIds.Distinct().Count() == 1) continue;

            var mem = mset.Select(id => memberById[id])
                .OrderBy(m => m.DateOfBirth ?? DateOnly.MaxValue).ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
                .ToList();
            var high = compHigh.GetValueOrDefault(root);
            suggestions.Add(new SiblingSuggestionDto(mem,
                compEvidence[root].OrderBy(x => x).Take(6).ToList(),
                high ? "Élevée" : "Moyenne"));
        }

        return suggestions
            .OrderByDescending(s => s.Confidence == "Élevée")
            .ThenByDescending(s => s.Members.Count)
            .Take(MaxSuggestions)
            .ToList();
    }

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

// ── Reconcile-dialog data: the full family picture the CG picks canonical parents/address from ──
public record GetSiblingReconcileDataQuery(IReadOnlyList<Guid> MemberIds) : IRequest<SiblingReconcileDto>;

public class GetSiblingReconcileDataQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetSiblingReconcileDataQuery, SiblingReconcileDto>
{
    public async ValueTask<SiblingReconcileDto> Handle(GetSiblingReconcileDataQuery request, CancellationToken ct)
    {
        var ids = request.MemberIds.Distinct().ToList();

        var members = await context.Members
            .Where(m => ids.Contains(m.Id) && !m.IsDeleted)
            .Select(m => new SiblingReconcileMemberDto(m.Id, m.FirstName, m.LastName, m.DateOfBirth,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(), m.SiblingGroupId))
            .ToListAsync(ct);

        var gLinks = await context.GuardianLinks
            .Where(l => ids.Contains(l.MemberId))
            .Select(l => new { l.GuardianId, l.MemberId, l.RelationshipType, GFirst = l.Guardian.FirstName, GLast = l.Guardian.LastName })
            .ToListAsync(ct);
        var guardianIds = gLinks.Select(l => l.GuardianId).Distinct().ToList();
        var gPhones = await context.GuardianPhones.Where(p => guardianIds.Contains(p.GuardianId))
            .Select(p => new { p.GuardianId, p.CountryCode, p.Number }).ToListAsync(ct);
        var gEmails = await context.GuardianEmails.Where(e => guardianIds.Contains(e.GuardianId))
            .Select(e => new { e.GuardianId, e.Address }).ToListAsync(ct);

        var guardians = guardianIds.Select(gid =>
        {
            var ls = gLinks.Where(l => l.GuardianId == gid).ToList();
            return new SiblingGuardianDto(gid, ls[0].GFirst, ls[0].GLast, SiblingUtil.NormRole(ls[0].RelationshipType),
                gPhones.Where(p => p.GuardianId == gid).Select(p => $"{p.CountryCode} {p.Number}".Trim()).Distinct().ToList(),
                gEmails.Where(e => e.GuardianId == gid).Select(e => e.Address).Distinct().ToList(),
                ls.Select(l => l.MemberId).Distinct().ToList());
        }).ToList();

        var addresses = await context.MemberAddresses.Where(a => ids.Contains(a.MemberId))
            .Select(a => new SiblingAddressDto(a.Id, a.MemberId, a.Country, a.City, a.Details, a.IsPrimary))
            .ToListAsync(ct);

        return new SiblingReconcileDto(members,
            guardians.Where(g => g.Role == "pere").ToList(),
            guardians.Where(g => g.Role == "mere").ToList(),
            guardians.Where(g => g.Role == "autre").ToList(),
            addresses);
    }
}

// ── Confirmed fratries list (Fratries confirmées tab), optional name search ──
public record GetSiblingGroupsQuery(string? Search) : IRequest<IReadOnlyList<SiblingGroupDto>>;

public class GetSiblingGroupsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetSiblingGroupsQuery, IReadOnlyList<SiblingGroupDto>>
{
    public async ValueTask<IReadOnlyList<SiblingGroupDto>> Handle(GetSiblingGroupsQuery request, CancellationToken ct)
    {
        var rows = await context.Members
            .Where(m => m.SiblingGroupId != null && !m.IsDeleted)
            .Select(m => new SiblingCandidateMemberDto(m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(), m.SiblingGroupId))
            .ToListAsync(ct);

        var groups = rows
            .GroupBy(m => m.SiblingGroupId!.Value)
            .Select(g => new SiblingGroupDto(g.Key,
                g.OrderBy(m => m.DateOfBirth ?? DateOnly.MaxValue).ThenBy(m => m.LastName).ThenBy(m => m.FirstName).ToList()))
            .Where(g => g.Members.Count >= 1)
            .ToList();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var key = TextNormalization.NormalizeKey(request.Search);
            groups = groups.Where(g => g.Members.Any(m =>
                TextNormalization.NormalizeKey($"{m.FirstName} {m.LastName}").Contains(key))).ToList();
        }

        return groups
            .OrderBy(g => g.Members[0].LastName).ThenBy(g => g.Members[0].FirstName)
            .ToList();
    }
}

// ── Member fiche: this member's confirmed siblings (gated by MemberAccess, so it shows on Ma fiche too) ──
public record GetMemberSiblingsQuery(Guid MemberId) : IRequest<Result<IReadOnlyList<MemberSiblingDto>>>;

public class GetMemberSiblingsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberSiblingsQuery, Result<IReadOnlyList<MemberSiblingDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberSiblingDto>>> Handle(GetMemberSiblingsQuery request, CancellationToken ct)
    {
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<IReadOnlyList<MemberSiblingDto>>.Failure("Accès non autorisé.");

        var groupId = await context.Members.Where(m => m.Id == request.MemberId).Select(m => m.SiblingGroupId).FirstOrDefaultAsync(ct);
        if (groupId is null) return Result<IReadOnlyList<MemberSiblingDto>>.Success([]);

        var siblings = await context.Members
            .Where(m => m.SiblingGroupId == groupId && m.Id != request.MemberId && !m.IsDeleted)
            .Select(m => new MemberSiblingDto(m.Id, m.FirstName, m.LastName, m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(), m.DateOfBirth))
            .ToListAsync(ct);

        // Order in memory (EF can't translate the DateOnly.MaxValue null-coalesce in ORDER BY).
        var ordered = siblings.OrderBy(m => m.DateOfBirth ?? DateOnly.MaxValue).ThenBy(m => m.LastName).ToList();
        return Result<IReadOnlyList<MemberSiblingDto>>.Success(ordered);
    }
}
