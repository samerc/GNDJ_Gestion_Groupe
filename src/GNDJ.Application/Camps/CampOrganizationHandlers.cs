using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — organizing the camp around the familles and the commission:
//   • Familles: a name (the character / emblem) and a short description, printed on the passport.
//   • Superfamilles (optional): groups of familles (e.g. 5 "universes" of 10) — only a label, used on the
//     printouts and the ranking; it doesn't change the draft or the rotation.
//   • Sub-commissions (Trésor, Jeu, Code…): the commission members are put in one or more of them.

public record CampSuperFamilleDto(Guid Id, string Name, string? Description, int DisplayOrder, IReadOnlyList<int> FamilleNumbers);

// ─── Superfamilles ───────────────────────────────────────────────────────────
public record GetCampSuperFamillesQuery(Guid CampId) : IRequest<Result<IReadOnlyList<CampSuperFamilleDto>>>;
public class GetCampSuperFamillesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampSuperFamillesQuery, Result<IReadOnlyList<CampSuperFamilleDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampSuperFamilleDto>>> Handle(GetCampSuperFamillesQuery request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Familles, false, ct) is { } denied) return Result<IReadOnlyList<CampSuperFamilleDto>>.Failure(denied);
        var supers = await context.CampSuperFamilles.Where(s => s.CampId == request.CampId && !s.IsDeleted)
            .OrderBy(s => s.DisplayOrder).ThenBy(s => s.Name).ToListAsync(ct);
        var links = await context.Familles.Where(f => f.CampId == request.CampId && !f.IsDeleted && f.SuperFamilleId != null)
            .Select(f => new { f.SuperFamilleId, f.Number }).ToListAsync(ct);
        return Result<IReadOnlyList<CampSuperFamilleDto>>.Success(supers.Select(s => new CampSuperFamilleDto(s.Id, s.Name, s.Description, s.DisplayOrder,
            links.Where(l => l.SuperFamilleId == s.Id).Select(l => l.Number).Order().ToList())).ToList());
    }
}

// Replaces the list (an existing one keeps its familles; a removed one ungroups them). Empty list = no superfamilles.
public record CampSuperFamilleInput(Guid? Id, string Name, string? Description);
public record SaveCampSuperFamillesCommand(Guid CampId, List<CampSuperFamilleInput> Items) : IRequest<Result<bool>>;
public class SaveCampSuperFamillesCommandValidator : AbstractValidator<SaveCampSuperFamillesCommand>
{
    public SaveCampSuperFamillesCommandValidator()
    {
        RuleFor(x => x.Items).Must(i => i.Count <= 20).WithMessage("20 superfamilles au maximum.");
        RuleForEach(x => x.Items).ChildRules(i =>
        {
            i.RuleFor(x => x.Name).NotEmpty().WithMessage("Chaque superfamille doit avoir un nom.").MaximumLength(100).NoHtml();
            i.RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        });
    }
}
public class SaveCampSuperFamillesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SaveCampSuperFamillesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SaveCampSuperFamillesCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Familles, true, ct) is { } denied) return Result<bool>.Failure(denied);
        var existing = await context.CampSuperFamilles.Where(s => s.CampId == request.CampId && !s.IsDeleted).ToListAsync(ct);
        var keep = request.Items.Where(i => i.Id != null).Select(i => i.Id!.Value).ToHashSet();
        var removed = existing.Where(e => !keep.Contains(e.Id)).Select(e => e.Id).ToList();
        if (removed.Count > 0)
        {
            // Soft delete doesn't fire the FK SetNull: ungroup the familles explicitly.
            await context.Familles.Where(f => f.SuperFamilleId != null && removed.Contains(f.SuperFamilleId.Value))
                .ExecuteUpdateAsync(s => s.SetProperty(f => f.SuperFamilleId, (Guid?)null), ct);
            context.CampSuperFamilles.RemoveRange(existing.Where(e => removed.Contains(e.Id)));
        }
        for (var i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            var row = item.Id is { } id ? existing.FirstOrDefault(e => e.Id == id) : null;
            if (row is null)
            {
                row = new CampSuperFamille { CampId = request.CampId };
                context.CampSuperFamilles.Add(row);
            }
            row.Name = item.Name.Trim();
            row.Description = string.IsNullOrWhiteSpace(item.Description) ? null : item.Description.Trim();
            row.DisplayOrder = i;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Splits the familles evenly across the superfamilles, in number order (50 familles / 5 → 1–10, 11–20…).
public record AutoAssignSuperFamillesCommand(Guid CampId) : IRequest<Result<bool>>;
public class AutoAssignSuperFamillesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<AutoAssignSuperFamillesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(AutoAssignSuperFamillesCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Familles, true, ct) is { } denied) return Result<bool>.Failure(denied);
        var supers = await context.CampSuperFamilles.Where(s => s.CampId == request.CampId && !s.IsDeleted)
            .OrderBy(s => s.DisplayOrder).Select(s => s.Id).ToListAsync(ct);
        if (supers.Count == 0) return Result<bool>.Failure("Créez d'abord les superfamilles.");
        var camp = await context.Camps.FirstAsync(c => c.Id == request.CampId, ct);
        var familles = await context.Familles.Where(f => f.CampId == request.CampId && !f.IsDeleted && f.Number <= camp.FamillesCount)
            .OrderBy(f => f.Number).ToListAsync(ct);
        if (familles.Count == 0) return Result<bool>.Failure("Aucune famille pour l'instant (lancez la répartition d'abord).");
        var per = (int)Math.Ceiling(familles.Count / (double)supers.Count);
        for (var i = 0; i < familles.Count; i++) familles[i].SuperFamilleId = supers[Math.Min(i / per, supers.Count - 1)];
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ─── Famille name / description / superfamille ───────────────────────────────
public record UpdateFamilleInfoCommand(Guid FamilleId, string? Name, string? Description, Guid? SuperFamilleId) : IRequest<Result<bool>>;
public class UpdateFamilleInfoCommandValidator : AbstractValidator<UpdateFamilleInfoCommand>
{
    public UpdateFamilleInfoCommandValidator()
    {
        RuleFor(x => x.Name).MaximumLength(100).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
    }
}
public class UpdateFamilleInfoCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateFamilleInfoCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateFamilleInfoCommand request, CancellationToken ct)
    {
        var f = await context.Familles.FirstOrDefaultAsync(x => x.Id == request.FamilleId && !x.IsDeleted, ct);
        if (f is null) return Result<bool>.Failure("Famille introuvable.");
        if (await CampAccess.DenyAsync(context, currentUser, f.CampId, CampArea.Familles, true, ct) is { } denied) return Result<bool>.Failure(denied);
        if (request.SuperFamilleId is { } sid && !await context.CampSuperFamilles.AnyAsync(s => s.Id == sid && s.CampId == f.CampId && !s.IsDeleted, ct))
            return Result<bool>.Failure("Superfamille introuvable.");
        f.Name = string.IsNullOrWhiteSpace(request.Name) ? null : request.Name.Trim();
        f.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        f.SuperFamilleId = request.SuperFamilleId;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ─── Sub-commissions ─────────────────────────────────────────────────────────
public static class CampSubCommissionList
{
    public static List<string> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [.. CampSubCommissions.Defaults];
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? [.. CampSubCommissions.Defaults]; }
        catch { return [.. CampSubCommissions.Defaults]; }
    }
}

public record GetCampSubCommissionsQuery(Guid CampId) : IRequest<Result<IReadOnlyList<string>>>;
public class GetCampSubCommissionsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampSubCommissionsQuery, Result<IReadOnlyList<string>>>
{
    public async ValueTask<Result<IReadOnlyList<string>>> Handle(GetCampSubCommissionsQuery request, CancellationToken ct)
    {
        var me = await CampAccess.ForAsync(context, currentUser, request.CampId, ct);
        if (!me.IsAdmin && !me.IsCommissionMember) return Result<IReadOnlyList<string>>.Failure(CampAccess.Denied);
        var json = await context.Camps.Where(c => c.Id == request.CampId).Select(c => c.SubCommissionsJson).FirstOrDefaultAsync(ct);
        return Result<IReadOnlyList<string>>.Success(CampSubCommissionList.Parse(json));
    }
}

// The camp's list of sub-commissions (a renamed / removed one is dropped from the members who had it).
public record SetCampSubCommissionsCommand(Guid CampId, List<string> Names) : IRequest<Result<bool>>;
public class SetCampSubCommissionsCommandValidator : AbstractValidator<SetCampSubCommissionsCommand>
{
    public SetCampSubCommissionsCommandValidator()
    {
        RuleFor(x => x.Names).Must(n => n.Count <= 20).WithMessage("20 sous-commissions au maximum.");
        RuleForEach(x => x.Names).NotEmpty().MaximumLength(60).NoHtml();
    }
}
public class SetCampSubCommissionsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SetCampSubCommissionsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCampSubCommissionsCommand request, CancellationToken ct)
    {
        var me = await CampAccess.ForAsync(context, currentUser, request.CampId, ct);
        if (!me.CanManageCommission) return Result<bool>.Failure(CampAccess.Denied);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.CampId, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        var names = request.Names.Select(n => n.Trim()).Where(n => n.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        camp.SubCommissionsJson = JsonSerializer.Serialize(names);
        var members = await context.CampCommissionMembers.Where(c => c.CampId == request.CampId).ToListAsync(ct);
        foreach (var m in members) m.SubCommissions = m.SubCommissions.Where(names.Contains).ToList();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record SetCommissionMemberSubCommissionsCommand(Guid CampId, Guid MemberId, List<string> Names) : IRequest<Result<bool>>;
public class SetCommissionMemberSubCommissionsCommandValidator : AbstractValidator<SetCommissionMemberSubCommissionsCommand>
{
    public SetCommissionMemberSubCommissionsCommandValidator()
    {
        RuleFor(x => x.Names).Must(n => n.Count <= 20);
        RuleForEach(x => x.Names).MaximumLength(60).NoHtml();
    }
}
public class SetCommissionMemberSubCommissionsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SetCommissionMemberSubCommissionsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCommissionMemberSubCommissionsCommand request, CancellationToken ct)
    {
        var me = await CampAccess.ForAsync(context, currentUser, request.CampId, ct);
        if (!me.CanManageCommission) return Result<bool>.Failure(CampAccess.Denied);
        var row = await context.CampCommissionMembers.FirstOrDefaultAsync(c => c.CampId == request.CampId && c.MemberId == request.MemberId, ct);
        if (row is null) return Result<bool>.Failure("Ce membre ne fait pas partie de la commission.");
        var allowed = CampSubCommissionList.Parse(await context.Camps.Where(c => c.Id == request.CampId).Select(c => c.SubCommissionsJson).FirstOrDefaultAsync(ct));
        if (request.Names.Any(n => !allowed.Contains(n))) return Result<bool>.Failure("Sous-commission inconnue.");
        row.SubCommissions = request.Names.Distinct().ToList();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
