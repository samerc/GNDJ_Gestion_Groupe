using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// ============================================================
// « Listes des chefs d'unité » — the new-members Excel of each unit, rebuilt from TODAY's data, to download or resend
// to the unit's chef(s) d'unité when things changed after « Envoyer les réponses » (unit changed, late acceptance,
// cancelled acceptance, parents corrected on the fiche…). New member = accepted by a demande of the year with a
// member file that still exists; listed in the unit of his CURRENT post (the decided unit first if he has several).
// Everything comes from the member's fiche (names, birth date, classe, école, matricule, parents), siblings = same
// confirmed fratrie with a current post in the same unit.
// ============================================================
public record UnitNewMemberListDto(Guid UnitId, string UnitName, int Count, IReadOnlyList<string> ChefNames);

public record GetUnitNewMemberListsQuery(string ScoutYear) : IRequest<Result<IReadOnlyList<UnitNewMemberListDto>>>;

public class GetUnitNewMemberListsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitNewMemberListsQuery, Result<IReadOnlyList<UnitNewMemberListDto>>>
{
    public async ValueTask<Result<IReadOnlyList<UnitNewMemberListDto>>> Handle(GetUnitNewMemberListsQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<IReadOnlyList<UnitNewMemberListDto>>.Failure("Accès refusé.");
        var byUnit = await UnitNewMemberLists.BuildAsync(context, request.ScoutYear, null, ct);
        var heads = await UnitNewMembersMail.LoadUnitHeadsAsync(context, byUnit.Keys.ToList(), ct);
        return Result<IReadOnlyList<UnitNewMemberListDto>>.Success(byUnit
            .Select(kv => new UnitNewMemberListDto(kv.Key, kv.Value.UnitName, kv.Value.Rows.Count,
                (heads.GetValueOrDefault(kv.Key) ?? []).Select(h => h.Name).ToList()))
            .OrderBy(x => x.UnitName).ToList());
    }
}

public record UnitNewMemberListFile(string FileName, byte[] Content);

public record DownloadUnitNewMemberListQuery(string ScoutYear, Guid UnitId) : IRequest<Result<UnitNewMemberListFile>>;

public class DownloadUnitNewMemberListQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, IUnitNewMembersSheet sheet)
    : IRequestHandler<DownloadUnitNewMemberListQuery, Result<UnitNewMemberListFile>>
{
    public async ValueTask<Result<UnitNewMemberListFile>> Handle(DownloadUnitNewMemberListQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<UnitNewMemberListFile>.Failure("Accès refusé.");
        var byUnit = await UnitNewMemberLists.BuildAsync(context, request.ScoutYear, request.UnitId, ct);
        if (!byUnit.TryGetValue(request.UnitId, out var list)) return Result<UnitNewMemberListFile>.Failure("Aucun nouveau membre dans cette unité.");
        // The sheet writer saves to the server's archive folder (made for email attachments): read it back, then delete.
        var path = sheet.Save(list.UnitName, request.ScoutYear, list.Rows);
        try { return Result<UnitNewMemberListFile>.Success(new UnitNewMemberListFile($"Nouveaux membres - {list.UnitName}.xlsx", await File.ReadAllBytesAsync(path, ct))); }
        finally { try { File.Delete(path); } catch (IOException) { /* best effort — the archive folder is cleaned anyway */ } }
    }
}

public record SendUnitNewMemberListsResult(int Units, int Emails, IReadOnlyList<string> UnitsWithoutChef);

// UnitIds empty = every unit that has new members.
public record SendUnitNewMemberListsCommand(string ScoutYear, IReadOnlyList<Guid> UnitIds) : IRequest<Result<SendUnitNewMemberListsResult>>;

public class SendUnitNewMemberListsCommandValidator : AbstractValidator<SendUnitNewMemberListsCommand>
{
    public SendUnitNewMemberListsCommandValidator()
    {
        RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20).Matches(@"^[0-9\- ]+$").WithMessage("Année scoute invalide.");
        RuleFor(x => x.UnitIds).NotNull().Must(u => u.Count <= 200).WithMessage("Trop d'unités.");
    }
}

public class SendUnitNewMemberListsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser,
    IUnitNewMembersSheet sheet, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendUnitNewMemberListsCommand, Result<SendUnitNewMemberListsResult>>
{
    public async ValueTask<Result<SendUnitNewMemberListsResult>> Handle(SendUnitNewMemberListsCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<SendUnitNewMemberListsResult>.Failure("Accès refusé.");
        var byUnit = await UnitNewMemberLists.BuildAsync(context, request.ScoutYear, null, ct);
        var targets = request.UnitIds.Count == 0 ? byUnit.Keys.ToList() : byUnit.Keys.Where(request.UnitIds.Contains).ToList();
        if (targets.Count == 0) return Result<SendUnitNewMemberListsResult>.Failure("Aucun nouveau membre dans les unités choisies.");

        var heads = await UnitNewMembersMail.LoadUnitHeadsAsync(context, targets, ct);
        var jobs = new List<EmailJob>();
        var noChef = new List<string>();
        foreach (var unitId in targets)
        {
            var list = byUnit[unitId];
            if (!heads.TryGetValue(unitId, out var recipients)) { noChef.Add(list.UnitName); continue; }
            jobs.AddRange(UnitNewMembersMail.BuildJobs("demande_unit_new_members_update", list.UnitName, request.ScoutYear, list.Rows, recipients, sheet));
        }
        if (jobs.Count > 0) await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendUnitLists", "Demande", null, newValues: new
        {
            request.ScoutYear, Units = targets.Select(t => byUnit[t].UnitName).ToList(), Emails = jobs.Count, UnitsWithoutChef = noChef,
        }, cancellationToken: ct);
        return Result<SendUnitNewMemberListsResult>.Success(new SendUnitNewMemberListsResult(targets.Count - noChef.Count, jobs.Count, noChef));
    }
}

public static class UnitNewMemberLists
{
    public sealed record UnitList(string UnitName, List<NewMemberSheetRow> Rows);

    public static async Task<Dictionary<Guid, UnitList>> BuildAsync(IApplicationDbContext context, string scoutYear, Guid? onlyUnit, CancellationToken ct)
    {
        // The year's accepted demandes that created (or reused) a member file.
        var accepted = await context.Demandes.AsNoTracking()
            .Where(d => d.ScoutYear == scoutYear && d.Status == DemandeStatus.Approved && d.CreatedMemberId != null)
            .Select(d => new { MemberId = d.CreatedMemberId!.Value, d.DecidedUnitId })
            .ToListAsync(ct);
        if (accepted.Count == 0) return [];
        var decidedByMember = accepted.GroupBy(a => a.MemberId).ToDictionary(g => g.Key, g => g.First().DecidedUnitId);
        var memberIds = decidedByMember.Keys.ToList();

        var members = await context.Members.AsNoTracking().Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.LastName, m.FirstName, m.DateOfBirth, m.Gender, m.Classe, m.School, m.CardNumber, m.SiblingGroupId })
            .ToDictionaryAsync(m => m.Id, ct);
        // Current posts → the unit he is in today (decided unit first when he has several).
        var posts = await context.MemberAssignments.AsNoTracking()
            .Where(a => memberIds.Contains(a.MemberId) && a.EndDate == null && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.UnitId, a.Unit.Name })
            .ToListAsync(ct);
        var unitOf = posts.GroupBy(p => p.MemberId).ToDictionary(g => g.Key,
            g => g.FirstOrDefault(p => p.UnitId == decidedByMember.GetValueOrDefault(g.Key)) ?? g.First());

        var parents = await context.GuardianLinks.AsNoTracking().Where(l => memberIds.Contains(l.MemberId))
            .Select(l => new { l.MemberId, l.RelationshipType, l.Guardian.FirstName, l.Guardian.LastName })
            .ToListAsync(ct);
        var parentsBy = parents.GroupBy(p => p.MemberId).ToDictionary(g => g.Key, g => g.ToList());

        // Siblings in the same unit: confirmed fratrie (any member, new or not) with a current post there.
        var groupIds = members.Values.Where(m => m.SiblingGroupId != null).Select(m => m.SiblingGroupId!.Value).Distinct().ToList();
        var siblingPosts = groupIds.Count == 0 ? [] : await context.MemberAssignments.AsNoTracking()
            .Where(a => a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted && a.Member.SiblingGroupId != null && groupIds.Contains(a.Member.SiblingGroupId.Value))
            .Select(a => new { a.MemberId, a.UnitId, GroupId = a.Member.SiblingGroupId!.Value, Name = a.Member.FirstName + " " + a.Member.LastName })
            .ToListAsync(ct);

        static string? Names(IEnumerable<string> names) { var n = string.Join(", ", names); return n.Length == 0 ? null : n; }

        var result = new Dictionary<Guid, UnitList>();
        foreach (var (memberId, m) in members)
        {
            if (!unitOf.TryGetValue(memberId, out var post)) continue; // no current post: not in a unit any more
            if (onlyUnit is Guid ou && post.UnitId != ou) continue;
            var ps = parentsBy.GetValueOrDefault(memberId) ?? [];
            var father = ps.Where(p => ParentRoles.IsFather(p.RelationshipType)).Select(p => $"{p.FirstName} {p.LastName}".Trim());
            var mother = ps.Where(p => ParentRoles.IsMother(p.RelationshipType)).Select(p => $"{p.FirstName} {p.LastName}".Trim());
            var others = ps.Where(p => !ParentRoles.IsFather(p.RelationshipType) && !ParentRoles.IsMother(p.RelationshipType))
                .Select(p => $"{p.FirstName} {p.LastName} ({p.RelationshipType})".Trim());
            var sibs = m.SiblingGroupId is Guid gid
                ? siblingPosts.Where(s => s.GroupId == gid && s.UnitId == post.UnitId && s.MemberId != memberId).Select(s => s.Name).Distinct()
                : [];
            if (!result.TryGetValue(post.UnitId, out var list)) result[post.UnitId] = list = new UnitList(post.Name, []);
            list.Rows.Add(new NewMemberSheetRow(m.LastName, m.FirstName, m.DateOfBirth, m.Gender, m.Classe, m.School, m.CardNumber,
                Names(father), Names(mother), Names(others), Names(sibs)));
        }
        foreach (var l in result.Values) l.Rows.Sort((a, b) => string.Compare($"{a.LastName} {a.FirstName}", $"{b.LastName} {b.FirstName}", StringComparison.CurrentCulture));
        return result;
    }
}
