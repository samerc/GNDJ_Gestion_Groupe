using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.MemberGroups;

// Reusable rule-based member groups (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …). Managed by a group
// manager (CG/ACG/super-admin). Membership is computed live from the rules (see MemberGroupResolver); these
// handlers are the CRUD over the group DEFINITIONS.

// ValueLabel is a READ-ONLY, human-readable resolution of Value (a role/unit/branch/member name, or a profile
// name) so the UI never shows a raw GUID. Writes send only Include/Criterion/Value; the handlers ignore ValueLabel.
public record MemberGroupRuleDto(bool Include, string Criterion, string? Value, string? ValueLabel = null);
public record MemberGroupDto(
    Guid Id, string Name, string ScopeType, Guid? UnitTypeId, string? UnitTypeName, Guid? UnitId, string? UnitName,
    bool PerUnit, bool IsVisible, bool ShowInUnitList, bool IsSystem, int MemberCount, IReadOnlyList<MemberGroupRuleDto> Rules);

// Only a group manager (super-admin or maitrise.manage = CG/ACG) may see/manage member groups.
internal static class MemberGroupAccess
{
    public static bool CanManage(ICurrentUserService u) => u.IsSuperAdmin || u.Permissions.Contains(Permissions.MaitriseManage);
}

// ── List ──
public record GetMemberGroupsQuery : IRequest<Result<IReadOnlyList<MemberGroupDto>>>;

public class GetMemberGroupsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberGroupsQuery, Result<IReadOnlyList<MemberGroupDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberGroupDto>>> Handle(GetMemberGroupsQuery request, CancellationToken ct)
    {
        if (!MemberGroupAccess.CanManage(currentUser)) return Result<IReadOnlyList<MemberGroupDto>>.Failure("Accès non autorisé.");

        var groups = await context.MemberGroups.Include(g => g.Rules).Include(g => g.UnitType).Include(g => g.Unit)
            .OrderByDescending(g => g.IsSystem).ThenBy(g => g.Name).ToListAsync(ct);

        // Batch-resolve every rule's Value → a human name (role/unit/branch/member name, or profile name) so the
        // UI shows readable chips instead of raw GUIDs. Collect the referenced ids/codes across all groups first.
        var roleIds = new HashSet<Guid>(); var unitIds = new HashSet<Guid>();
        var unitTypeIds = new HashSet<Guid>(); var memberIds = new HashSet<Guid>();
        var profileCodes = new HashSet<string>();
        foreach (var r in groups.SelectMany(g => g.Rules))
        {
            if (string.IsNullOrWhiteSpace(r.Value)) continue;
            switch (r.Criterion)
            {
                case MemberGroupCriteria.Role: if (Guid.TryParse(r.Value, out var ri)) roleIds.Add(ri); break;
                case MemberGroupCriteria.Unit: if (Guid.TryParse(r.Value, out var ui)) unitIds.Add(ui); break;
                case MemberGroupCriteria.UnitType: if (Guid.TryParse(r.Value, out var ti)) unitTypeIds.Add(ti); break;
                case MemberGroupCriteria.Member: if (Guid.TryParse(r.Value, out var mi)) memberIds.Add(mi); break;
                case MemberGroupCriteria.Profile: profileCodes.Add(r.Value); break;
            }
        }
        var roleNames = await context.FunctionalRoles.Where(x => roleIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var unitNames = await context.Units.Where(x => unitIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var unitTypeNames = await context.UnitTypes.Where(x => unitTypeIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var memberNames = await context.Members.Where(x => memberIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.FirstName + " " + x.LastName, ct);
        var profileNames = await context.SecurityProfiles.Where(x => profileCodes.Contains(x.Code)).ToDictionaryAsync(x => x.Code, x => x.Name, ct);

        string? Label(MemberGroupRule r) => string.IsNullOrWhiteSpace(r.Value) ? null : r.Criterion switch
        {
            MemberGroupCriteria.Profile => profileNames.GetValueOrDefault(r.Value),
            MemberGroupCriteria.Role => Guid.TryParse(r.Value, out var ri) ? roleNames.GetValueOrDefault(ri) : null,
            MemberGroupCriteria.Unit => Guid.TryParse(r.Value, out var ui) ? unitNames.GetValueOrDefault(ui) : null,
            MemberGroupCriteria.UnitType => Guid.TryParse(r.Value, out var ti) ? unitTypeNames.GetValueOrDefault(ti) : null,
            MemberGroupCriteria.Member => Guid.TryParse(r.Value, out var mi) ? memberNames.GetValueOrDefault(mi) : null,
            _ => null,
        };

        var list = new List<MemberGroupDto>(groups.Count);
        foreach (var g in groups)
        {
            // Live member count (rules resolved). Groups are few, so a count per group is fine (no N+1 concern).
            var count = await MemberGroupResolver.RosterQuery(context, g).Select(a => a.MemberId).Distinct().CountAsync(ct);
            list.Add(new MemberGroupDto(g.Id, g.Name, g.ScopeType, g.UnitTypeId, g.UnitType?.Name, g.UnitId, g.Unit?.Name,
                g.PerUnit, g.IsVisible, g.ShowInUnitList, g.IsSystem, count,
                // Order by id: v7 ids are created sequentially in the saved order, so this preserves the UI order.
                g.Rules.OrderBy(r => r.Id).Select(r => new MemberGroupRuleDto(r.Include, r.Criterion, r.Value, Label(r))).ToList()));
        }
        return Result<IReadOnlyList<MemberGroupDto>>.Success(list);
    }
}

// ── Members of a group (resolved live) ──
// Email/Phone are the reachable contact = the member's OWN (primary first) else a guardian's ("membre puis parent"),
// so the list doubles as a mailing/contact export. Only exposed to a group manager (this is leader data).
public record MemberGroupMemberDto(Guid MemberId, string FirstName, string LastName, Guid UnitId, string? UnitName,
    string? TeamName, string RoleName, string? Email, string? Phone);
public record GetMemberGroupMembersQuery(Guid Id) : IRequest<Result<IReadOnlyList<MemberGroupMemberDto>>>;

public class GetMemberGroupMembersQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberGroupMembersQuery, Result<IReadOnlyList<MemberGroupMemberDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberGroupMemberDto>>> Handle(GetMemberGroupMembersQuery request, CancellationToken ct)
    {
        if (!MemberGroupAccess.CanManage(currentUser)) return Result<IReadOnlyList<MemberGroupMemberDto>>.Failure("Accès non autorisé.");
        var g = await context.MemberGroups.Include(x => x.Rules).FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (g is null) return Result<IReadOnlyList<MemberGroupMemberDto>>.Failure("Groupe introuvable.");

        // Resolve the live roster (assignments), then project. A member with several matching assignments is shown
        // once (dedupe by member, keeping the first — matches the member COUNT which is Distinct by member).
        var rows = await MemberGroupResolver.RosterQuery(context, g)
            .Select(a => new
            {
                a.MemberId,
                a.Member.FirstName,
                a.Member.LastName,
                a.Member.PrimaryContactEmail,
                a.UnitId,
                UnitName = a.Unit.Name,
                TeamName = a.Team != null ? a.Team.Name : null,
                RoleName = a.FunctionalRole.Name,
            })
            .ToListAsync(ct);

        var distinct = rows.GroupBy(r => r.MemberId).Select(grp => grp.First())
            .OrderBy(r => r.LastName).ThenBy(r => r.FirstName).ToList();
        var memberIds = distinct.Select(r => r.MemberId).ToList();

        // Resolve one email + one phone per member (own primary first, else a guardian's).
        var emails = await ContactEmailResolver.LoadAsync(context, memberIds, ct);
        var phones = await MemberContactPhones.LoadAsync(context, memberIds, ct);

        var members = distinct
            .Select(r => new MemberGroupMemberDto(r.MemberId, r.FirstName, r.LastName, r.UnitId, r.UnitName, r.TeamName, r.RoleName,
                emails.Resolve(r.MemberId, r.PrimaryContactEmail), phones.Resolve(r.MemberId)))
            .ToList();
        return Result<IReadOnlyList<MemberGroupMemberDto>>.Success(members);
    }
}

// Batched member phone resolver: member's OWN (primary first) else a guardian's (primary first). Mirrors
// ContactEmailResolver for phones; kept local to member-group contact export (the general resolvers return email).
internal sealed class MemberContactPhones
{
    private readonly ILookup<Guid, (string Number, bool IsPrimary)> _own;
    private readonly Dictionary<Guid, List<Guid>> _memberGuardians;
    private readonly ILookup<Guid, (string Number, bool IsPrimary)> _guardian;

    private MemberContactPhones(ILookup<Guid, (string, bool)> own, Dictionary<Guid, List<Guid>> mg, ILookup<Guid, (string, bool)> guardian)
    { _own = own; _memberGuardians = mg; _guardian = guardian; }

    public static async Task<MemberContactPhones> LoadAsync(IApplicationDbContext context, List<Guid> memberIds, CancellationToken ct)
    {
        var own = (await context.MemberPhones.Where(p => memberIds.Contains(p.MemberId) && !p.IsDeleted)
            .Select(p => new { p.MemberId, p.CountryCode, p.Number, p.IsPrimary }).ToListAsync(ct))
            .ToLookup(p => p.MemberId, p => (Combine(p.CountryCode, p.Number), p.IsPrimary));
        var links = await context.GuardianLinks.Where(l => memberIds.Contains(l.MemberId) && !l.IsDeleted)
            .Select(l => new { l.MemberId, l.GuardianId }).ToListAsync(ct);
        var mg = links.GroupBy(l => l.MemberId).ToDictionary(x => x.Key, x => x.Select(y => y.GuardianId).Distinct().ToList());
        var gids = links.Select(l => l.GuardianId).Distinct().ToList();
        var guardian = (await context.GuardianPhones.Where(p => gids.Contains(p.GuardianId) && !p.IsDeleted)
            .Select(p => new { p.GuardianId, p.CountryCode, p.Number, p.IsPrimary }).ToListAsync(ct))
            .ToLookup(p => p.GuardianId, p => (Combine(p.CountryCode, p.Number), p.IsPrimary));
        return new MemberContactPhones(own, mg, guardian);
    }

    private static string Combine(string? code, string number) => string.IsNullOrWhiteSpace(code) ? number : $"{code} {number}";

    public string? Resolve(Guid memberId)
    {
        var ownNum = _own[memberId].OrderByDescending(p => p.IsPrimary).Select(p => p.Number).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n));
        if (!string.IsNullOrWhiteSpace(ownNum)) return ownNum;
        if (_memberGuardians.TryGetValue(memberId, out var gids))
            foreach (var gid in gids)
            {
                var num = _guardian[gid].OrderByDescending(p => p.IsPrimary).Select(p => p.Number).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n));
                if (!string.IsNullOrWhiteSpace(num)) return num;
            }
        return null;
    }
}

// ── Create / Update shared validation ──
internal static class MemberGroupValidation
{
    public static string? Validate(string scopeType, Guid? unitTypeId, Guid? unitId, IReadOnlyList<MemberGroupRuleDto> rules)
    {
        if (!MemberGroupScopes.All.Contains(scopeType)) return "Portée invalide.";
        if (scopeType == MemberGroupScopes.Unit && unitId is null) return "Unité requise pour une portée unité.";
        if (scopeType == MemberGroupScopes.UnitType && unitTypeId is null) return "Type d'unité requis pour cette portée.";
        if (rules is null || rules.Count == 0) return "Au moins une règle est requise.";
        if (rules.Count > 50) return "Trop de règles.";
        if (!rules.Any(r => r.Include)) return "Au moins une règle d'inclusion est requise.";
        foreach (var r in rules)
        {
            if (!MemberGroupCriteria.All.Contains(r.Criterion)) return "Critère invalide.";
            if (MemberGroupCriteria.NeedValue.Contains(r.Criterion) && string.IsNullOrWhiteSpace(r.Value))
                return "Une valeur est requise pour ce critère.";
        }
        return null;
    }
}

public record CreateMemberGroupCommand(string Name, string ScopeType, Guid? UnitTypeId, Guid? UnitId, bool PerUnit,
    bool IsVisible, bool ShowInUnitList, List<MemberGroupRuleDto> Rules) : IRequest<Result<Guid>>;

public class CreateMemberGroupCommandValidator : AbstractValidator<CreateMemberGroupCommand>
{
    public CreateMemberGroupCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(150)
            .Must(n => n == null || (!n.Contains('<') && !n.Contains('>'))).WithMessage("Le nom contient des caractères invalides.");
    }
}

public class CreateMemberGroupCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<CreateMemberGroupCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateMemberGroupCommand request, CancellationToken ct)
    {
        if (!MemberGroupAccess.CanManage(currentUser)) return Result<Guid>.Failure("Accès non autorisé.");
        var err = MemberGroupValidation.Validate(request.ScopeType, request.UnitTypeId, request.UnitId, request.Rules);
        if (err is not null) return Result<Guid>.Failure(err);

        var g = new MemberGroup
        {
            Name = request.Name.Trim(),
            ScopeType = request.ScopeType,
            UnitTypeId = request.ScopeType == MemberGroupScopes.UnitType ? request.UnitTypeId : null,
            UnitId = request.ScopeType == MemberGroupScopes.Unit ? request.UnitId : null,
            PerUnit = request.ScopeType == MemberGroupScopes.UnitType && request.PerUnit, // only meaningful for a branch
            IsVisible = request.IsVisible,
            ShowInUnitList = request.ShowInUnitList,
            IsSystem = false,
        };
        foreach (var r in request.Rules)
            g.Rules.Add(new MemberGroupRule { Id = Guid.CreateVersion7(), Include = r.Include, Criterion = r.Criterion, Value = r.Value });
        context.MemberGroups.Add(g);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(g.Id);
    }
}

public record UpdateMemberGroupCommand(Guid Id, string Name, string ScopeType, Guid? UnitTypeId, Guid? UnitId, bool PerUnit,
    bool IsVisible, bool ShowInUnitList, List<MemberGroupRuleDto> Rules) : IRequest<Result<bool>>;

public class UpdateMemberGroupCommandValidator : AbstractValidator<UpdateMemberGroupCommand>
{
    public UpdateMemberGroupCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(150)
            .Must(n => n == null || (!n.Contains('<') && !n.Contains('>'))).WithMessage("Le nom contient des caractères invalides.");
    }
}

public class UpdateMemberGroupCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UpdateMemberGroupCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMemberGroupCommand request, CancellationToken ct)
    {
        if (!MemberGroupAccess.CanManage(currentUser)) return Result<bool>.Failure("Accès non autorisé.");
        var g = await context.MemberGroups.Include(x => x.Rules).FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (g is null) return Result<bool>.Failure("Groupe introuvable.");

        // A system preset's name/scope/rules are fixed (it can only be shown/hidden); custom groups are fully editable.
        if (g.IsSystem)
        {
            g.IsVisible = request.IsVisible;
            g.ShowInUnitList = request.ShowInUnitList;
            await context.SaveChangesAsync(ct);
            return Result<bool>.Success(true);
        }

        var err = MemberGroupValidation.Validate(request.ScopeType, request.UnitTypeId, request.UnitId, request.Rules);
        if (err is not null) return Result<bool>.Failure(err);

        g.Name = request.Name.Trim();
        g.ScopeType = request.ScopeType;
        g.UnitTypeId = request.ScopeType == MemberGroupScopes.UnitType ? request.UnitTypeId : null;
        g.UnitId = request.ScopeType == MemberGroupScopes.Unit ? request.UnitId : null;
        g.PerUnit = request.ScopeType == MemberGroupScopes.UnitType && request.PerUnit;
        g.IsVisible = request.IsVisible;
        g.ShowInUnitList = request.ShowInUnitList;

        // Hard-replace the rules (plain children). IMPORTANT: operate on the DbSet directly and do NOT mutate the
        // tracked parent's nav collection (g.Rules) — mutating it (Clear/Add) triggers EF relationship fixup that
        // severs the just-deleted children and throws DbUpdateConcurrencyException on SaveChanges (the same gotcha
        // as multi-page docs / sibling contacts). New rules keep the request's order (sequential v7 ids), which the
        // read side orders by, so the UI ordering is preserved.
        context.MemberGroupRules.RemoveRange(g.Rules);
        foreach (var r in request.Rules)
            context.MemberGroupRules.Add(new MemberGroupRule { Id = Guid.CreateVersion7(), MemberGroupId = g.Id, Include = r.Include, Criterion = r.Criterion, Value = r.Value });

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteMemberGroupCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMemberGroupCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<DeleteMemberGroupCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMemberGroupCommand request, CancellationToken ct)
    {
        if (!MemberGroupAccess.CanManage(currentUser)) return Result<bool>.Failure("Accès non autorisé.");
        var g = await context.MemberGroups.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (g is null) return Result<bool>.Failure("Groupe introuvable.");
        if (g.IsSystem) return Result<bool>.Failure("Ce groupe est prédéfini et ne peut pas être supprimé (vous pouvez le masquer).");
        // Keep the history: block deletion while réunions reference it (hide it instead).
        if (await context.Meetings.AnyAsync(m => m.MemberGroupId == g.Id, ct))
            return Result<bool>.Failure("Des réunions utilisent ce groupe. Masquez-le plutôt que de le supprimer.");

        context.MemberGroups.Remove(g);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Send a message (email) to a group's members — the "mailing list" use ──
// Content is either an existing template (TemplateCode) OR free text (Subject + BodyHtml, sent via the seeded
// "adhoc_message" template). Recipients = one email per member (own then parent), deduped by address. Optional
// UnitId narrows a per-unit group to a single unit. Emails go through the durable outbox (never blocks; survives
// restart), so this returns fast with a queued/no-contact report.
public record SendGroupMessageCommand(Guid GroupId, Guid? UnitId, string? TemplateCode, string? Subject, string? BodyHtml)
    : IRequest<Result<SendGroupMessageResult>>;
public record SendGroupMessageResult(int Recipients, int NoContact, IReadOnlyList<string> NoContactNames);

public class SendGroupMessageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue)
    : IRequestHandler<SendGroupMessageCommand, Result<SendGroupMessageResult>>
{
    public async ValueTask<Result<SendGroupMessageResult>> Handle(SendGroupMessageCommand request, CancellationToken ct)
    {
        if (!MemberGroupAccess.CanManage(currentUser)) return Result<SendGroupMessageResult>.Failure("Accès non autorisé.");

        // Content: a template code, OR a free-text subject + body (routed through the seeded "adhoc_message").
        var useTemplate = !string.IsNullOrWhiteSpace(request.TemplateCode);
        if (!useTemplate)
        {
            if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.BodyHtml))
                return Result<SendGroupMessageResult>.Failure("Choisissez un modèle ou saisissez un objet et un message.");
            if (request.Subject!.Length > 200) return Result<SendGroupMessageResult>.Failure("L'objet est trop long (max 200).");
            if (request.BodyHtml!.Length > 10000) return Result<SendGroupMessageResult>.Failure("Le message est trop long.");
        }

        var g = await context.MemberGroups.Include(x => x.Rules).FirstOrDefaultAsync(x => x.Id == request.GroupId, ct);
        if (g is null) return Result<SendGroupMessageResult>.Failure("Groupe introuvable.");

        var roster = MemberGroupResolver.RosterQuery(context, g);
        if (request.UnitId is Guid u) roster = roster.Where(a => a.UnitId == u); // per-unit send

        var rows = await roster.Select(a => new
        {
            a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.PrimaryContactEmail, UnitName = a.Unit.Name
        }).ToListAsync(ct);
        var distinct = rows.GroupBy(r => r.MemberId).Select(x => x.First()).ToList();
        if (distinct.Count == 0) return Result<SendGroupMessageResult>.Failure("Ce groupe n'a aucun membre dans cette portée.");

        var emails = await ContactEmailResolver.LoadAsync(context, distinct.Select(r => r.MemberId).ToList(), ct);

        // One email per DISTINCT address (a parent shared by siblings gets one message). Members with no
        // reachable email are reported so the manager can follow up another way.
        var byEmail = new Dictionary<string, (string MemberName, string UnitName)>(StringComparer.OrdinalIgnoreCase);
        var noContact = new List<string>();
        foreach (var r in distinct.OrderBy(r => r.LastName).ThenBy(r => r.FirstName))
        {
            var email = emails.Resolve(r.MemberId, r.PrimaryContactEmail);
            var name = $"{r.FirstName} {r.LastName}";
            if (string.IsNullOrWhiteSpace(email)) { noContact.Add(name); continue; }
            byEmail.TryAdd(email.Trim(), (name, r.UnitName)); // keep the first member for that address
        }

        var code = useTemplate ? request.TemplateCode!.Trim() : "adhoc_message";
        var jobs = byEmail.Select(kv =>
        {
            var vars = new Dictionary<string, string>
            {
                ["memberName"] = kv.Value.MemberName,
                ["unitName"] = kv.Value.UnitName,
                ["groupName"] = g.Name,
            };
            if (!useTemplate) { vars["subject"] = request.Subject!.Trim(); vars["body"] = request.BodyHtml!.Trim(); }
            return new EmailJob(code, kv.Key, vars);
        }).ToList();

        await emailQueue.EnqueueManyAsync(jobs, ct);
        return Result<SendGroupMessageResult>.Success(new SendGroupMessageResult(jobs.Count, noContact.Count, noContact));
    }
}
