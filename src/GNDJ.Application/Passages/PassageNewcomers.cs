using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Passages;

// Which lines are "accepted automatically" when the CU proposes them: a departure, or anything that stays in
// the member's current unit (no change, équipe change, fonction change). Only a move to ANOTHER unit waits for
// the CG.
public static class PassageAutoApprove
{
    public static bool Applies(bool isLeaving, Guid proposedUnitId, Guid currentUnitId) =>
        isLeaving || proposedUnitId == currentUnitId;
}

// Newcomers of a posted passage: members who moved INTO a different unit (not leavers, not same-unit changes).
// Used by the CU emails sent when the CG posts the passage and by the CG's Word export per association.
public static class PassageNewcomers
{
    public sealed record Move(Guid MemberId, Guid FromUnitId, Guid ToUnitId);

    // Finalized lines of the year that brought a member into another unit.
    public static async Task<List<Move>> LoadFinalizedAsync(IApplicationDbContext context, string scoutYear, CancellationToken ct) =>
        (await context.Passages
            .Where(p => p.ScoutYear == scoutYear && p.Status == PassageStatus.Finalized && !(p.FinalIsLeaving ?? p.IsLeaving))
            .Select(p => new { p.MemberId, p.CurrentUnitId, To = p.FinalUnitId ?? p.ProposedUnitId })
            .ToListAsync(ct))
        .Where(p => p.To != p.CurrentUnitId)
        .Select(p => new Move(p.MemberId, p.CurrentUnitId, p.To))
        .ToList();

    // Emails each receiving unit's CU(s) an Excel of their newcomers (parents' names only, same-unit siblings,
    // unit of origin). Runs AFTER the posting is committed (the new assignments exist). Returns the names of
    // receiving units without a reachable CU.
    public static async Task<List<string>> EmailUnitHeadsAsync(IApplicationDbContext context, IEmailQueue emailQueue,
        IUnitNewMembersSheet sheet, string scoutYear, IReadOnlyList<Move> moves, CancellationToken ct)
    {
        if (moves.Count == 0) return [];
        var destUnitIds = moves.Select(m => m.ToUnitId).Distinct().ToList();
        var unitIds = destUnitIds.Concat(moves.Select(m => m.FromUnitId)).Distinct().ToList();
        var unitNames = await context.Units.IgnoreQueryFilters().Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Name, ct);

        // Everyone now active in the receiving units (newcomers included) — to find same-unit brothers/sisters.
        var inUnits = await context.MemberAssignments
            .Where(a => destUnitIds.Contains(a.UnitId) && a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted)
            .Select(a => new { a.UnitId, a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.SiblingGroupId })
            .ToListAsync(ct);
        var memberIds = moves.Select(m => m.MemberId).Concat(inUnits.Select(x => x.MemberId)).Distinct().ToList();

        var moverIds = moves.Select(m => m.MemberId).Distinct().ToList();
        var members = await context.Members.Where(m => moverIds.Contains(m.Id))
            .Select(m => new { m.Id, m.LastName, m.FirstName, m.DateOfBirth, m.Gender, m.Classe, m.School, m.CardNumber, m.SiblingGroupId })
            .ToDictionaryAsync(m => m.Id, ct);
        var links = await context.GuardianLinks
            .Where(l => memberIds.Contains(l.MemberId) && !l.IsDeleted && !l.Guardian.IsDeleted)
            .Select(l => new { l.MemberId, l.GuardianId, l.RelationshipType, l.Guardian.FirstName, l.Guardian.LastName })
            .ToListAsync(ct);
        var guardiansOf = links.GroupBy(l => l.MemberId).ToDictionary(g => g.Key, g => g.Select(l => l.GuardianId).ToHashSet());

        static string Norm(string? s) => TextNormalization.NormalizeKey(s ?? "");
        static string? Join(IEnumerable<string> xs) { var s = string.Join(", ", xs.Where(x => x.Length > 0)); return s.Length == 0 ? null : s; }

        var heads = await UnitNewMembersMail.LoadUnitHeadsAsync(context, destUnitIds, ct);
        var noCu = new List<string>();
        var jobs = new List<EmailJob>();
        foreach (var unitId in destUnitIds)
        {
            var unitName = unitNames.GetValueOrDefault(unitId, "");
            var rows = moves.Where(m => m.ToUnitId == unitId && members.ContainsKey(m.MemberId))
                .Select(mv =>
                {
                    var m = members[mv.MemberId];
                    var gl = links.Where(l => l.MemberId == m.Id).ToList();
                    string Names(string rel) => string.Join(", ", gl.Where(l => Norm(l.RelationshipType) == rel).Select(l => $"{l.FirstName} {l.LastName}".Trim()));
                    var others = gl.Where(l => Norm(l.RelationshipType) is not ("pere" or "mere"))
                        .Select(l => $"{l.FirstName} {l.LastName} ({l.RelationshipType})".Trim());
                    // Brothers/sisters active in the same unit: same confirmed fratrie, or a shared parent.
                    var myGuardians = guardiansOf.GetValueOrDefault(m.Id) ?? [];
                    var sibs = inUnits.Where(x => x.UnitId == unitId && x.MemberId != m.Id
                            && ((m.SiblingGroupId != null && x.SiblingGroupId == m.SiblingGroupId)
                                || (guardiansOf.TryGetValue(x.MemberId, out var g) && g.Overlaps(myGuardians))))
                        .Select(x => $"{x.FirstName} {x.LastName}").Distinct();
                    return new NewMemberSheetRow(m.LastName, m.FirstName, m.DateOfBirth, m.Gender, m.Classe, m.School, m.CardNumber,
                        Join([Names("pere")]), Join([Names("mere")]), Join(others), Join(sibs),
                        unitNames.GetValueOrDefault(mv.FromUnitId));
                })
                .OrderBy(r => r.LastName).ThenBy(r => r.FirstName).ToList();
            if (rows.Count == 0) continue;
            if (!heads.TryGetValue(unitId, out var recipients)) { noCu.Add(unitName); continue; }
            jobs.AddRange(UnitNewMembersMail.BuildJobs("passage_unit_new_members", unitName, scoutYear, rows, recipients, sheet));
        }
        if (jobs.Count > 0) await emailQueue.EnqueueManyAsync(jobs, ct);
        return noCu;
    }
}

// ── CG Word export of the posted passage's newcomers, one document per association ─────────────────────
public record PassageNewcomerGroupDto(Guid? AssociationId, string AssociationName, int Count, int UnitCount);

// The associations that received newcomers (and how many), to offer one download per association.
public record GetPassageNewcomerGroupsQuery(string ScoutYear) : Mediator.IRequest<GNDJ.Application.Common.Models.Result<IReadOnlyList<PassageNewcomerGroupDto>>>;

public class GetPassageNewcomerGroupsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : Mediator.IRequestHandler<GetPassageNewcomerGroupsQuery, GNDJ.Application.Common.Models.Result<IReadOnlyList<PassageNewcomerGroupDto>>>
{
    public async ValueTask<GNDJ.Application.Common.Models.Result<IReadOnlyList<PassageNewcomerGroupDto>>> Handle(GetPassageNewcomerGroupsQuery request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser))
            return GNDJ.Application.Common.Models.Result<IReadOnlyList<PassageNewcomerGroupDto>>.Failure("Accès réservé à la maîtrise de groupe.");
        var moves = await PassageNewcomers.LoadFinalizedAsync(context, request.ScoutYear, ct);
        var units = await PassageNewcomersExport.LoadUnitsAsync(context, moves, ct);
        var groups = moves.GroupBy(m => units[m.ToUnitId].AssociationId)
            .Select(g => new PassageNewcomerGroupDto(g.Key, units[g.First().ToUnitId].AssociationName, g.Count(), g.Select(m => m.ToUnitId).Distinct().Count()))
            .OrderBy(g => g.AssociationId is null).ThenBy(g => g.AssociationName)
            .ToList();
        return GNDJ.Application.Common.Models.Result<IReadOnlyList<PassageNewcomerGroupDto>>.Success(groups);
    }
}

public record PassageNewcomersFile(byte[] Data, string FileName);

// The Word document for one association (AssociationId null = units that belong to no association).
public record GetPassageNewcomersDocQuery(string ScoutYear, Guid? AssociationId) : Mediator.IRequest<GNDJ.Application.Common.Models.Result<PassageNewcomersFile>>;

public class GetPassageNewcomersDocQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, IPassageNewcomersDocument document)
    : Mediator.IRequestHandler<GetPassageNewcomersDocQuery, GNDJ.Application.Common.Models.Result<PassageNewcomersFile>>
{
    public async ValueTask<GNDJ.Application.Common.Models.Result<PassageNewcomersFile>> Handle(GetPassageNewcomersDocQuery request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser))
            return GNDJ.Application.Common.Models.Result<PassageNewcomersFile>.Failure("Accès réservé à la maîtrise de groupe.");

        var moves = await PassageNewcomers.LoadFinalizedAsync(context, request.ScoutYear, ct);
        var units = await PassageNewcomersExport.LoadUnitsAsync(context, moves, ct);
        var mine = moves.Where(m => units[m.ToUnitId].AssociationId == request.AssociationId).ToList();
        if (mine.Count == 0)
            return GNDJ.Application.Common.Models.Result<PassageNewcomersFile>.Failure("Aucun nouveau membre pour cette association.");

        var ids = mine.Select(m => m.MemberId).Distinct().ToList();
        var names = await context.Members.IgnoreQueryFilters().Where(m => ids.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => new { m.FirstName, m.LastName }, ct);

        var sections = mine.GroupBy(m => m.ToUnitId)
            .Select(g => units[g.Key])
            .OrderBy(u => PassageNewcomersExport.BranchRank(u.TypeCode)).ThenBy(u => PassageNewcomersExport.UnitNumber(u.Name)).ThenBy(u => u.Name)
            .Select(u => new PassageNewcomersSection(
                $"Passe {PassageNewcomersExport.Article(u.Name)}{u.Name} :",
                mine.Where(m => m.ToUnitId == u.Id && names.ContainsKey(m.MemberId))
                    .Select(m => names[m.MemberId])
                    .OrderBy(n => n.LastName).ThenBy(n => n.FirstName)
                    .Select(n => $"{n.FirstName} {n.LastName}")
                    .ToList()))
            .ToList();

        var assocName = units[mine[0].ToUnitId].AssociationName;
        var data = document.Build($"Passage {request.ScoutYear} — {assocName}",
            $"Membres qui rejoignent une nouvelle unité ({mine.Count})", sections);
        var safe = string.Concat($"Passage {request.ScoutYear} - {assocName}".Where(c => !Path.GetInvalidFileNameChars().Contains(c))).Trim();
        return GNDJ.Application.Common.Models.Result<PassageNewcomersFile>.Success(new PassageNewcomersFile(data, $"{safe}.docx"));
    }
}

internal static class PassageNewcomersExport
{
    public sealed record UnitInfo(Guid Id, string Name, string TypeCode, Guid? AssociationId, string AssociationName);

    public static async Task<Dictionary<Guid, UnitInfo>> LoadUnitsAsync(IApplicationDbContext context, IEnumerable<PassageNewcomers.Move> moves, CancellationToken ct)
    {
        var ids = moves.Select(m => m.ToUnitId).Distinct().ToList();
        return await context.Units.IgnoreQueryFilters().Where(u => ids.Contains(u.Id))
            .Select(u => new UnitInfo(u.Id, u.Name, u.UnitType.Code, u.AssociationId,
                u.Association != null ? u.Association.Name : "Sans association"))
            .ToDictionaryAsync(u => u.Id, ct);
    }

    // Parcours order of the branches, then units by their number (Troupe 2, 3, 10 — not 10, 2, 3).
    private static readonly string[] Branches = ["MEU", "RON", "TRO", "COM", "CLAN", "NOY", "JEM", "FEU", "CAR", "GRP"];
    public static int BranchRank(string code) { var i = Array.IndexOf(Branches, code.ToUpperInvariant()); return i < 0 ? 99 : i; }
    public static int UnitNumber(string name)
    {
        var m = System.Text.RegularExpressions.Regex.Match(name, @"\d+");
        return m.Success && int.TryParse(m.Value, out var n) ? n : int.MaxValue;
    }

    // "Passe à la Troupe…", "Passe au Clan…", "Passe aux Jeunes en Marche…".
    public static string Article(string unitName)
    {
        var first = unitName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.ToLowerInvariant() ?? "";
        return first switch
        {
            "clan" or "noyau" or "feu" or "groupe" => "au ",
            "jeunes" => "aux ",
            _ => "à la ",
        };
    }
}
