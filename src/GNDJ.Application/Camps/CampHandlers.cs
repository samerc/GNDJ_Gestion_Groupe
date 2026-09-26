using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — edition CRUD + the Note formula (the score that drives the balanced famille draft).
// A camp's lifecycle status is Setup → Assigned (after the draft) → Closed.

// ─── DTOs ────────────────────────────────────────────────────────────────────
public record CampListDto(Guid Id, string Name, string ScoutYear, int FamillesCount, string Status, bool IsArchived,
    int ParticipantCount, int GradedCount, int AssignedCount);

public record CampDto(Guid Id, string Name, string ScoutYear, int FamillesCount, string Status, bool IsArchived,
    double NoteForceCoef, double NoteOffset, IReadOnlyList<BranchMultiplierDto> BranchMultipliers,
    int ParticipantCount, int GradedCount, int AssignedCount, int FamilleCreatedCount,
    // What the CALLER may do in this camp (drives which tabs / buttons the camp screen shows).
    CampMyAccessDto MyAccess);

public record BranchMultiplierDto(Guid UnitTypeId, string UnitTypeName, int Multiplier, int DefaultYears);

public record CampAttendeeDto(Guid MemberId, string FirstName, string LastName, string? Gender, string? UnitName,
    string? Branche, bool IsAttending, Guid? ParticipantId, string Role);

public record CampGradeRowDto(Guid? ParticipantId, Guid MemberId, string FirstName, string LastName, string? Gender,
    string? Branche, string? UnitName, string? TeamName, bool IsAttending,
    int? Force, int? Annee, double? Note, bool IsLeaderCandidate, string Role, string? Notes);

// ─── Note formula ────────────────────────────────────────────────────────────
public static class CampNote
{
    public static Dictionary<Guid, int> ParseMultipliers(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var raw = JsonSerializer.Deserialize<Dictionary<string, int>>(json) ?? [];
            var d = new Dictionary<Guid, int>();
            foreach (var (k, v) in raw) if (Guid.TryParse(k, out var g)) d[g] = v;
            return d;
        }
        catch { return []; }
    }

    // Note = ForceCoef*Force + multiplier(branche)*Année + Offset. The branch multiplier is the unit
    // type's NumberOfYears (e.g. Meute 3, Troupe 5) — this makes a Troupe Y3 outscore a Meute Y3 so older
    // branches weigh more, WITHOUT cumulating across years. `multipliers` is keyed by UnitTypeId; 5 is the
    // fallback when a type's NumberOfYears is unset.
    public static double? Compute(Camp camp, CampParticipant p, IReadOnlyDictionary<Guid, int> multipliers)
    {
        if (p.Force is null || p.Annee is null || p.UnitTypeId is null) return null;
        var mult = multipliers.TryGetValue(p.UnitTypeId.Value, out var m) ? m : 5;
        return camp.NoteForceCoef * p.Force.Value + mult * p.Annee.Value + camp.NoteOffset;
    }

    // Year-in-branch from assignment tenure (scout year starts ~Oct 1; Sept counts as the new year).
    public static int AnneeFromStart(DateOnly start, DateOnly today, int maxYears)
    {
        int Sy(DateOnly d) => d.Month >= 9 ? d.Year : d.Year - 1;
        var annee = Sy(today) - Sy(start) + 1;
        if (annee < 1) annee = 1;
        if (maxYears > 0 && annee > maxYears) annee = maxYears;
        return annee;
    }
}

// ─── List / get ──────────────────────────────────────────────────────────────
public record GetCampsQuery() : IRequest<Result<IReadOnlyList<CampListDto>>>;

public class GetCampsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCampsQuery, Result<IReadOnlyList<CampListDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampListDto>>> Handle(GetCampsQuery request, CancellationToken ct)
    {
        var camps = await context.Camps.OrderByDescending(c => c.IsArchived ? 0 : 1).ThenByDescending(c => c.CreatedAt)
            .Select(c => new CampListDto(c.Id, c.Name, c.ScoutYear, c.FamillesCount, c.Status, c.IsArchived,
                c.Participants.Count(p => !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre),
                c.Participants.Count(p => !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre && p.Note != null),
                c.Participants.Count(p => !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre && p.FamilleId != null)))
            .ToListAsync(ct);
        return Result<IReadOnlyList<CampListDto>>.Success(camps);
    }
}

public record GetCampQuery(Guid Id) : IRequest<Result<CampDto>>;

public class GetCampQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetCampQuery, Result<CampDto>>
{
    public async ValueTask<Result<CampDto>> Handle(GetCampQuery request, CancellationToken ct)
    {
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<CampDto>.Failure("Camp introuvable.");

        // Unit types actually present among this camp's member participants (the graded branches).
        // The multiplier IS the unit type's NumberOfYears (data-driven, not per-camp).
        var branches = await context.CampParticipants
            .Where(p => p.CampId == camp.Id && !p.IsDeleted && p.Role == CampRole.Membre && p.UnitTypeId != null)
            .Select(p => p.UnitTypeId!.Value).Distinct().ToListAsync(ct);
        var types = await context.UnitTypes.Where(t => branches.Contains(t.Id))
            .Select(t => new { t.Id, t.Name, t.NumberOfYears }).ToListAsync(ct);
        var branchDtos = types.OrderBy(t => t.Name)
            .Select(t => new BranchMultiplierDto(t.Id, t.Name, t.NumberOfYears ?? 5, t.NumberOfYears ?? 5))
            .ToList();

        var pc = await context.CampParticipants.Where(p => p.CampId == camp.Id && !p.IsDeleted && p.IsAttending && p.Role == CampRole.Membre)
            .Select(p => new { p.Note, p.FamilleId }).ToListAsync(ct);
        var familleCount = await context.Familles.CountAsync(f => f.CampId == camp.Id && !f.IsDeleted, ct);

        return Result<CampDto>.Success(new CampDto(camp.Id, camp.Name, camp.ScoutYear, camp.FamillesCount, camp.Status, camp.IsArchived,
            camp.NoteForceCoef, camp.NoteOffset, branchDtos,
            pc.Count, pc.Count(x => x.Note != null), pc.Count(x => x.FamilleId != null), familleCount,
            await CampAccess.ForAsync(context, currentUser, camp.Id, ct)));
    }
}

// ─── Commission BP ───────────────────────────────────────────────────────────
// Everyone on the commission (and the camp admins) sees the list; only the CG / ACG add or remove members and
// set each other member's rights per area. Only maîtrise
// (members holding an active leadership role) can be on a commission — never a regular member.
public record CampCommissionMemberDto(Guid MemberId, string FirstName, string LastName, string? Roles,
    bool IsChef, string FamillesAccess, string JeuxAccess, string ParametresAccess);
public record GetCampCommissionQuery(Guid CampId) : IRequest<Result<IReadOnlyList<CampCommissionMemberDto>>>;

public class GetCampCommissionQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampCommissionQuery, Result<IReadOnlyList<CampCommissionMemberDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampCommissionMemberDto>>> Handle(GetCampCommissionQuery request, CancellationToken ct)
    {
        var me = await CampAccess.ForAsync(context, currentUser, request.CampId, ct);
        if (!me.IsAdmin && !me.IsCommissionMember) return Result<IReadOnlyList<CampCommissionMemberDto>>.Failure(CampAccess.Denied);

        var rows = await context.CampCommissionMembers.Where(c => c.CampId == request.CampId)
            .Select(c => new
            {
                c.MemberId, c.Member.FirstName, c.Member.LastName, c.IsChef, c.FamillesAccess, c.JeuxAccess, c.ParametresAccess,
                // Their current active function(s), for context ("Assistant(e) de Groupe", "ACU Troupe 2"…).
                Roles = c.Member.Assignments.Where(a => a.EndDate == null && !a.IsDeleted)
                    .Select(a => a.FunctionalRole.Name + " · " + a.Unit.Code).ToList(),
            })
            .ToListAsync(ct);
        return Result<IReadOnlyList<CampCommissionMemberDto>>.Success(rows
            .OrderByDescending(r => r.IsChef).ThenBy(r => r.LastName).ThenBy(r => r.FirstName)
            .Select(r => new CampCommissionMemberDto(r.MemberId, r.FirstName, r.LastName, r.Roles.Count == 0 ? null : string.Join(", ", r.Roles),
                r.IsChef, r.FamillesAccess, r.JeuxAccess, r.ParametresAccess))
            .ToList());
    }
}

// Maîtrise members who can be put on a commission (active leadership role), for the CG / ACG member picker.
public record CampCommissionCandidateDto(Guid MemberId, string FirstName, string LastName, string? Roles);
// GroupLevelOnly = candidates for "Chef de commission" (ACGs: an active group-level role), else any maîtrise.
public record GetCampCommissionCandidatesQuery(bool GroupLevelOnly = false) : IRequest<Result<IReadOnlyList<CampCommissionCandidateDto>>>;

public class GetCampCommissionCandidatesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetCampCommissionCandidatesQuery, Result<IReadOnlyList<CampCommissionCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampCommissionCandidateDto>>> Handle(GetCampCommissionCandidatesQuery request, CancellationToken ct)
    {
        // CG, or a chef de commission of one of the camps (they pick the commission of their camp).
        var allowed = CampAccess.IsAdmin(currentUser) || (currentUser.MemberId is Guid me
            && await context.CampCommissionMembers.AnyAsync(c => c.MemberId == me && c.IsChef && !c.Camp.IsArchived, ct));
        if (!allowed) return Result<IReadOnlyList<CampCommissionCandidateDto>>.Failure(CampAccess.Denied);
        var rows = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted
                        && (request.GroupLevelOnly ? a.FunctionalRole.SecurityProfile.IsGroupLevel : a.FunctionalRole.IsMaitrise))
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, Role = a.FunctionalRole.Name + " · " + a.Unit.Code })
            .ToListAsync(ct);
        return Result<IReadOnlyList<CampCommissionCandidateDto>>.Success(rows
            .GroupBy(r => r.MemberId)
            .Select(g => new CampCommissionCandidateDto(g.Key, g.First().FirstName, g.First().LastName, string.Join(", ", g.Select(x => x.Role))))
            .OrderBy(c => c.LastName).ThenBy(c => c.FirstName)
            .ToList());
    }
}

// Replace the commission with this set of members (the CG or a chef de commission of the camp). Every
// member must be maîtrise. The chefs always stay (only the CG changes them, via SetCampChefs). New
// members start with no access to the areas (a chef de commission grants it). Takes effect at each member's next sign-in /
// refresh (≤ 15 min).
public record SetCampCommissionCommand(Guid CampId, List<Guid> MemberIds) : IRequest<Result<bool>>;

public class SetCampCommissionCommandValidator : AbstractValidator<SetCampCommissionCommand>
{
    public SetCampCommissionCommandValidator()
    {
        RuleFor(x => x.MemberIds).NotNull().Must(l => l.Count <= 50).WithMessage("Commission trop grande (50 max).");
    }
}

public class SetCampCommissionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetCampCommissionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCampCommissionCommand request, CancellationToken ct)
    {
        var me = await CampAccess.ForAsync(context, currentUser, request.CampId, ct);
        if (!me.CanManageCommission) return Result<bool>.Failure("Réservé au chef de groupe et aux chefs de commission.");
        var camp = await context.Camps.Where(c => c.Id == request.CampId).Select(c => new { c.Id, c.Name }).FirstOrDefaultAsync(ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");

        var existing = await context.CampCommissionMembers.Where(c => c.CampId == camp.Id).ToListAsync(ct);
        // The chefs can't be removed here (only the CG changes them) → always kept.
        var wanted = request.MemberIds.Union(existing.Where(e => e.IsChef).Select(e => e.MemberId)).Distinct().ToList();
        // Maîtrise is checked only for members being ADDED: someone already on it (e.g. added before the rule, or who
        // since lost their leadership role) must always be removable.
        var added = wanted.Where(id => existing.All(e => e.MemberId != id)).ToList();
        if (await CampCommissionRules.CheckMaitriseAsync(context, added, ct) is { } error) return Result<bool>.Failure(error);

        context.CampCommissionMembers.RemoveRange(existing.Where(e => !wanted.Contains(e.MemberId)));
        foreach (var id in wanted.Where(id => existing.All(e => e.MemberId != id)))
            context.CampCommissionMembers.Add(new CampCommissionMember { CampId = camp.Id, MemberId = id });
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("SetCommission", "Camp", camp.Id, newValues: new
        {
            Camp = camp.Name, Members = await AuditNames.MembersAsync(context, wanted, ct),
        }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Set one commission member's rights per area (a chef de commission, or the CG). A chef de commission's rights are
// always full, so they can't be changed here.
public record SetCampCommissionAccessCommand(Guid CampId, Guid MemberId, string FamillesAccess, string JeuxAccess, string ParametresAccess)
    : IRequest<Result<bool>>;

public class SetCampCommissionAccessCommandValidator : AbstractValidator<SetCampCommissionAccessCommand>
{
    public SetCampCommissionAccessCommandValidator()
    {
        RuleFor(x => x.FamillesAccess).Must(v => CampAccessLevel.All.Contains(v)).WithMessage("Niveau d'accès invalide.");
        RuleFor(x => x.JeuxAccess).Must(v => CampAccessLevel.All.Contains(v)).WithMessage("Niveau d'accès invalide.");
        RuleFor(x => x.ParametresAccess).Must(v => CampAccessLevel.All.Contains(v)).WithMessage("Niveau d'accès invalide.");
    }
}

public class SetCampCommissionAccessCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetCampCommissionAccessCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCampCommissionAccessCommand request, CancellationToken ct)
    {
        var me = await CampAccess.ForAsync(context, currentUser, request.CampId, ct);
        if (!me.CanSetRights) return Result<bool>.Failure("Réservé aux chefs de commission.");

        var row = await context.CampCommissionMembers
            .FirstOrDefaultAsync(c => c.CampId == request.CampId && c.MemberId == request.MemberId, ct);
        if (row is null) return Result<bool>.Failure("Ce membre ne fait pas partie de la commission.");
        if (row.IsChef) return Result<bool>.Failure("Un chef de commission a déjà tous les accès.");

        row.FamillesAccess = request.FamillesAccess;
        row.JeuxAccess = request.JeuxAccess;
        row.ParametresAccess = request.ParametresAccess;
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("SetCommissionAccess", "Camp", request.CampId, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, request.MemberId, ct),
            Familles = request.FamillesAccess, Jeux = request.JeuxAccess, Parametres = request.ParametresAccess,
        }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Choose the camp's chefs (CG only): ACGs (an active group-level role) with full rights on this camp.
// A member added here joins the commission if needed; one no longer listed stays on the commission as a member.
public record SetCampChefsCommand(Guid CampId, List<Guid> MemberIds) : IRequest<Result<bool>>;

public class SetCampChefsCommandValidator : AbstractValidator<SetCampChefsCommand>
{
    public SetCampChefsCommandValidator()
        => RuleFor(x => x.MemberIds).NotNull().Must(l => l.Count <= 10).WithMessage("10 chefs de commission au maximum.");
}

public class SetCampChefsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetCampChefsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetCampChefsCommand request, CancellationToken ct)
    {
        if (!CampAccess.IsAdmin(currentUser)) return Result<bool>.Failure(CampAccess.AdminOnly);
        var camp = await context.Camps.Where(c => c.Id == request.CampId).Select(c => new { c.Id, c.Name }).FirstOrDefaultAsync(ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        var wanted = request.MemberIds.Distinct().ToList();
        if (await CampCommissionRules.CheckGroupLevelAsync(context, wanted, ct) is { } error) return Result<bool>.Failure(error);

        var existing = await context.CampCommissionMembers.Where(c => c.CampId == camp.Id).ToListAsync(ct);
        foreach (var e in existing) e.IsChef = wanted.Contains(e.MemberId);
        foreach (var id in wanted.Where(id => existing.All(e => e.MemberId != id)))
            context.CampCommissionMembers.Add(new CampCommissionMember { CampId = camp.Id, MemberId = id, IsChef = true });
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("SetChefs", "Camp", camp.Id, newValues: new
        {
            Camp = camp.Name, Chefs = await AuditNames.MembersAsync(context, wanted, ct),
        }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Who may sit where on a commission.
static class CampCommissionRules
{
    // Every commission member must hold an active leadership (maîtrise) role — never a regular member.
    public static async Task<string?> CheckMaitriseAsync(IApplicationDbContext context, List<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return null;
        var ok = await context.MemberAssignments
            .Where(a => ids.Contains(a.MemberId) && a.EndDate == null && !a.IsDeleted && a.FunctionalRole.IsMaitrise && !a.Member.IsDeleted)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var bad = ids.Except(ok).ToList();
        return bad.Count == 0 ? null
            : $"Seuls les membres de la maîtrise peuvent faire partie de la commission : {await AuditNames.MembersAsync(context, bad, ct)}.";
    }

    // A chef de commission must be an assistant chef de groupe (an active group-level role).
    public static async Task<string?> CheckGroupLevelAsync(IApplicationDbContext context, List<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return null;
        var ok = await context.MemberAssignments
            .Where(a => ids.Contains(a.MemberId) && a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.IsGroupLevel && !a.Member.IsDeleted)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var bad = ids.Except(ok).ToList();
        return bad.Count == 0 ? null
            : $"Les chefs de commission doivent être des assistants chef de groupe : {await AuditNames.MembersAsync(context, bad, ct)}.";
    }
}

// ─── Create ──────────────────────────────────────────────────────────────────
// ChefMemberIds = the ACG(s) the CG picks to lead this camp (full rights on it). Optional.
public record CreateCampCommand(string Name, string ScoutYear, int? FamillesCount, List<Guid>? ChefMemberIds = null) : IRequest<Result<Guid>>;

public class CreateCampCommandValidator : AbstractValidator<CreateCampCommand>
{
    public CreateCampCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).NoHtml();
        RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20).NoHtml();
    }
}

public class CreateCampCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<CreateCampCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateCampCommand request, CancellationToken ct)
    {
        if (!CampAccess.IsAdmin(currentUser)) return Result<Guid>.Failure(CampAccess.AdminOnly);
        var defaultCount = await context.Settings.Where(s => s.Key == "camp.familles_count").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var count = request.FamillesCount ?? (int.TryParse(defaultCount, out var d) ? d : 12);

        var chefs = (request.ChefMemberIds ?? []).Distinct().ToList();
        if (await CampCommissionRules.CheckGroupLevelAsync(context, chefs, ct) is { } error) return Result<Guid>.Failure(error);

        var camp = new Camp { Name = request.Name.Trim(), ScoutYear = request.ScoutYear.Trim(), FamillesCount = count };
        context.Camps.Add(camp);
        foreach (var id in chefs)
            context.CampCommissionMembers.Add(new CampCommissionMember { CampId = camp.Id, MemberId = id, IsChef = true });
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(camp.Id);
    }
}

// ─── Update settings / formula ───────────────────────────────────────────────
public record UpdateCampCommand(Guid Id, string Name, string ScoutYear, int FamillesCount,
    double NoteForceCoef, double NoteOffset, IReadOnlyList<BranchMultiplierInput>? BranchMultipliers) : IRequest<Result<bool>>;
public record BranchMultiplierInput(Guid UnitTypeId, int Multiplier);

public class UpdateCampCommandValidator : AbstractValidator<UpdateCampCommand>
{
    public UpdateCampCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).NoHtml();
        RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20).NoHtml();
    }
}

public class UpdateCampCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateCampCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCampCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.Id, CampArea.Parametres, true, ct) is { } denied) return Result<bool>.Failure(denied);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");

        camp.Name = request.Name.Trim();
        camp.ScoutYear = request.ScoutYear.Trim();
        camp.FamillesCount = request.FamillesCount;
        camp.NoteForceCoef = request.NoteForceCoef;
        camp.NoteOffset = request.NoteOffset;

        // Recompute every note with the new coefs (multiplier = unit type NumberOfYears).
        var branchYears = await context.UnitTypes.ToDictionaryAsync(t => t.Id, t => t.NumberOfYears ?? 5, ct);
        var parts = await context.CampParticipants.Where(p => p.CampId == camp.Id && !p.IsDeleted).ToListAsync(ct);
        foreach (var p in parts) p.Note = CampNote.Compute(camp, p, branchYears);

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record ArchiveCampCommand(Guid Id, bool Archive) : IRequest<Result<bool>>;
public class ArchiveCampCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<ArchiveCampCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ArchiveCampCommand request, CancellationToken ct)
    {
        if (!CampAccess.IsAdmin(currentUser)) return Result<bool>.Failure(CampAccess.AdminOnly);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        camp.IsArchived = request.Archive;
        if (request.Archive) camp.Status = CampStatus.Closed;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteCampCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteCampCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteCampCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCampCommand request, CancellationToken ct)
    {
        if (!CampAccess.IsAdmin(currentUser)) return Result<bool>.Failure(CampAccess.AdminOnly);
        var camp = await context.Camps.FirstOrDefaultAsync(c => c.Id == request.Id, ct);
        if (camp is null) return Result<bool>.Failure("Camp introuvable.");
        context.Camps.Remove(camp);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
