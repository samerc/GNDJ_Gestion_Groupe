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
    bool IsVisible, bool ShowInUnitList, bool IsSystem, int MemberCount, IReadOnlyList<MemberGroupRuleDto> Rules);

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
                g.IsVisible, g.ShowInUnitList, g.IsSystem, count,
                g.Rules.Select(r => new MemberGroupRuleDto(r.Include, r.Criterion, r.Value, Label(r))).ToList()));
        }
        return Result<IReadOnlyList<MemberGroupDto>>.Success(list);
    }
}

// ── Members of a group (resolved live) ──
public record MemberGroupMemberDto(Guid MemberId, string FirstName, string LastName, string? UnitName, string? TeamName, string RoleName);
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
                UnitName = a.Unit.Name,
                TeamName = a.Team != null ? a.Team.Name : null,
                RoleName = a.FunctionalRole.Name,
            })
            .ToListAsync(ct);

        var members = rows
            .GroupBy(r => r.MemberId)
            .Select(grp => grp.First())
            .OrderBy(r => r.LastName).ThenBy(r => r.FirstName)
            .Select(r => new MemberGroupMemberDto(r.MemberId, r.FirstName, r.LastName, r.UnitName, r.TeamName, r.RoleName))
            .ToList();
        return Result<IReadOnlyList<MemberGroupMemberDto>>.Success(members);
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

public record CreateMemberGroupCommand(string Name, string ScopeType, Guid? UnitTypeId, Guid? UnitId, bool IsVisible,
    bool ShowInUnitList, List<MemberGroupRuleDto> Rules) : IRequest<Result<Guid>>;

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

public record UpdateMemberGroupCommand(Guid Id, string Name, string ScopeType, Guid? UnitTypeId, Guid? UnitId, bool IsVisible,
    bool ShowInUnitList, List<MemberGroupRuleDto> Rules) : IRequest<Result<bool>>;

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
        g.IsVisible = request.IsVisible;
        g.ShowInUnitList = request.ShowInUnitList;

        // Hard-replace the rules (plain children).
        context.MemberGroupRules.RemoveRange(g.Rules);
        g.Rules.Clear();
        foreach (var r in request.Rules)
            g.Rules.Add(new MemberGroupRule { Id = Guid.CreateVersion7(), MemberGroupId = g.Id, Include = r.Include, Criterion = r.Criterion, Value = r.Value });

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
