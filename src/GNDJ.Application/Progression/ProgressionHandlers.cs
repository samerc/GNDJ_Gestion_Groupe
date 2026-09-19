using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Progression;

// ─── DTOs ──────────────────────────────────
// UnitTypeId/UnitTypeName are null for a GLOBAL stage/badge (available to every unit type).
public record ScoutStageDto(Guid Id, Guid? UnitTypeId, string? UnitTypeName, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, bool IsBadgeStage, int ProgressionCount);
public record BadgeDto(Guid Id, Guid? UnitTypeId, string? UnitTypeName, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, int ProgressionCount);
public record ScoutStageListDto(Guid Id, string Code, string Name, bool IsBadgeStage);
public record BadgeListDto(Guid Id, string Code, string Name);

// A recorded progression event: a member reaching a stage (and, for badge-stages, the specific badge).
// UnitId/UnitName are null for a GLOBAL progression (a stage with no unit type — recorded outside any unit).
public record MemberProgressionDto(
    Guid Id, Guid MemberId, Guid? UnitId, string? UnitName,
    Guid ScoutStageId, string ScoutStageCode, string ScoutStageName,
    Guid? BadgeId, string? BadgeCode, string? BadgeName,
    DateOnly Date, string? Location, string? Notes, DateTime CreatedAt
);

// Resolves a code: keeps an explicit one (or returns null if it collides), else auto-slugs the
// name to a unique code (appending -2, -3, … on collision). Used by stage + badge create.
static class ProgressionCodes
{
    public static async Task<string?> ResolveAsync(string? requested, string name, Func<string, Task<bool>> exists, string fallback = "x")
    {
        if (!string.IsNullOrWhiteSpace(requested))
            return await exists(requested) ? null : requested;

        var baseCode = ContentText.Slugify(name);
        if (string.IsNullOrWhiteSpace(baseCode)) baseCode = fallback;
        if (baseCode.Length > 45) baseCode = baseCode[..45];
        var code = baseCode;
        for (var i = 2; await exists(code); i++)
            code = $"{baseCode}-{i}";
        return code;
    }
}

// ─── Scout Stage CRUD ──────────────────────

// GetAll by unit type. GlobalOnly = only the global (no-unit-type) stages, for the admin "Global" pill.
public record GetScoutStagesQuery(Guid? UnitTypeId, bool GlobalOnly = false) : IRequest<IReadOnlyList<ScoutStageDto>>;

public class GetScoutStagesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetScoutStagesQuery, IReadOnlyList<ScoutStageDto>>
{
    public async ValueTask<IReadOnlyList<ScoutStageDto>> Handle(GetScoutStagesQuery request, CancellationToken ct)
    {
        var query = context.ScoutStages.AsQueryable();
        if (request.GlobalOnly) query = query.Where(s => s.UnitTypeId == null);
        else if (request.UnitTypeId.HasValue) query = query.Where(s => s.UnitTypeId == request.UnitTypeId.Value);

        return await query
            // Global stages (null unit type) last; then by type name, order, name. Null-safe for the optional nav.
            .OrderBy(s => s.UnitTypeId == null ? 1 : 0).ThenBy(s => s.UnitType != null ? s.UnitType.Name : "").ThenBy(s => s.DisplayOrder).ThenBy(s => s.Name)
            .Select(s => new ScoutStageDto(s.Id, s.UnitTypeId, s.UnitType != null ? s.UnitType.Name : null, s.Code, s.Name, s.Description, s.DisplayOrder, s.IsActive, s.IsBadgeStage, s.Progressions.Count(p => !p.IsDeleted)))
            .ToListAsync(ct);
    }
}

// Active list for pickers. Global=true → ONLY the global (no-unit-type) stages, shown as a separate "Général"
// entity in the member form. Otherwise → ONLY that unit type's own stages (globals are NOT mixed in, so they
// don't appear under every unit).
public record GetScoutStageListQuery(Guid? UnitTypeId, bool Global = false) : IRequest<IReadOnlyList<ScoutStageListDto>>;

public class GetScoutStageListQueryHandler(IApplicationDbContext context) : IRequestHandler<GetScoutStageListQuery, IReadOnlyList<ScoutStageListDto>>
{
    public async ValueTask<IReadOnlyList<ScoutStageListDto>> Handle(GetScoutStageListQuery request, CancellationToken ct)
    {
        var query = request.Global
            ? context.ScoutStages.Where(s => s.UnitTypeId == null && s.IsActive)
            : context.ScoutStages.Where(s => s.UnitTypeId == request.UnitTypeId && s.IsActive);
        return await query
            .OrderBy(s => s.DisplayOrder).ThenBy(s => s.Name)
            .Select(s => new ScoutStageListDto(s.Id, s.Code, s.Name, s.IsBadgeStage))
            .ToListAsync(ct);
    }
}

// Create. UnitTypeId null = a GLOBAL stage (available to every unit type).
public record CreateScoutStageCommand(Guid? UnitTypeId, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, bool IsBadgeStage) : IRequest<Result<Guid>>;

public class CreateScoutStageCommandValidator : AbstractValidator<CreateScoutStageCommand>
{
    public CreateScoutStageCommandValidator()
    {
        // Code optional: auto-generated from the name when left blank (inline add).
        RuleFor(x => x.Code).MaximumLength(50).NoHtml();
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
        // UnitTypeId optional: null = global. (EF null-semantics make the code-uniqueness check below work for null.)
    }
}

public class CreateScoutStageCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateScoutStageCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateScoutStageCommand request, CancellationToken ct)
    {
        var code = await ProgressionCodes.ResolveAsync(
            request.Code, request.Name,
            c => context.ScoutStages.AnyAsync(s => s.UnitTypeId == request.UnitTypeId && s.Code == c, ct));
        if (code is null) return Result<Guid>.Failure(request.UnitTypeId is null ? "Une étape globale avec ce code existe déjà." : "Une étape avec ce code existe déjà pour ce type d'unité.");

        var entity = new ScoutStage
        {
            UnitTypeId = request.UnitTypeId,
            Code = code,
            Name = request.Name,
            Description = request.Description,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive,
            IsBadgeStage = request.IsBadgeStage
        };

        context.ScoutStages.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "ScoutStage", entity.Id, newValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateScoutStageCommand(Guid Id, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, bool IsBadgeStage) : IRequest<Result<bool>>;

public class UpdateScoutStageCommandValidator : AbstractValidator<UpdateScoutStageCommand>
{
    public UpdateScoutStageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50).NoHtml();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
    }
}

public class UpdateScoutStageCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateScoutStageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateScoutStageCommand request, CancellationToken ct)
    {
        var entity = await context.ScoutStages.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Étape introuvable.");

        var exists = await context.ScoutStages.AnyAsync(s => s.UnitTypeId == entity.UnitTypeId && s.Code == request.Code && s.Id != request.Id, ct);
        if (exists) return Result<bool>.Failure("Une étape avec ce code existe déjà pour ce type d'unité.");

        var oldValues = new { entity.Code, entity.Name, entity.IsActive };
        entity.Code = request.Code;
        entity.Name = request.Name;
        entity.Description = request.Description;
        entity.DisplayOrder = request.DisplayOrder;
        entity.IsActive = request.IsActive;
        entity.IsBadgeStage = request.IsBadgeStage;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "ScoutStage", entity.Id, oldValues: oldValues, newValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteScoutStageCommand(Guid Id) : IRequest<Result<bool>>;

// If the stage is used by any member progression, it is ARCHIVED (IsActive=false → hidden from the
// dropdowns but kept so it still shows on those members) instead of deleted. Unused stages are
// hard-deleted. Result value = true when archived, false when deleted.
public class DeleteScoutStageCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteScoutStageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteScoutStageCommand request, CancellationToken ct)
    {
        var entity = await context.ScoutStages.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Étape introuvable.");

        var used = await context.MemberProgressions.AnyAsync(p => p.ScoutStageId == request.Id, ct);
        if (used)
        {
            if (entity.IsActive)
            {
                entity.IsActive = false;
                await context.SaveChangesAsync(ct);
                await auditService.LogAsync("Archive", "ScoutStage", entity.Id, oldValues: new { entity.Code, entity.Name }, cancellationToken: ct);
            }
            return Result<bool>.Success(true); // archived
        }

        context.ScoutStages.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "ScoutStage", entity.Id, oldValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<bool>.Success(false); // deleted
    }
}

// Reorder stages
public record ReorderScoutStagesCommand(List<Guid> OrderedIds) : IRequest<Result<bool>>;

public class ReorderScoutStagesCommandValidator : AbstractValidator<ReorderScoutStagesCommand>
{
    public ReorderScoutStagesCommandValidator()
        => RuleFor(x => x.OrderedIds).NotNull().Must(l => l.Count <= 1000).WithMessage("Trop d'éléments.");
}

public class ReorderScoutStagesCommandHandler(IApplicationDbContext context) : IRequestHandler<ReorderScoutStagesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReorderScoutStagesCommand request, CancellationToken ct)
    {
        var stages = await context.ScoutStages.Where(s => request.OrderedIds.Contains(s.Id)).ToListAsync(ct);
        for (var i = 0; i < request.OrderedIds.Count; i++)
        {
            var stage = stages.FirstOrDefault(s => s.Id == request.OrderedIds[i]);
            if (stage is not null) stage.DisplayOrder = i;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ─── Badge CRUD ────────────────────────────

// GlobalOnly = only the global (no-unit-type) badges, for the admin "Global" pill.
public record GetBadgesQuery(Guid? UnitTypeId, bool GlobalOnly = false) : IRequest<IReadOnlyList<BadgeDto>>;

public class GetBadgesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBadgesQuery, IReadOnlyList<BadgeDto>>
{
    public async ValueTask<IReadOnlyList<BadgeDto>> Handle(GetBadgesQuery request, CancellationToken ct)
    {
        var query = context.Badges.AsQueryable();
        if (request.GlobalOnly) query = query.Where(b => b.UnitTypeId == null);
        else if (request.UnitTypeId.HasValue) query = query.Where(b => b.UnitTypeId == request.UnitTypeId.Value);

        return await query
            .OrderBy(b => b.UnitTypeId == null ? 1 : 0).ThenBy(b => b.UnitType != null ? b.UnitType.Name : "").ThenBy(b => b.DisplayOrder).ThenBy(b => b.Name)
            .Select(b => new BadgeDto(b.Id, b.UnitTypeId, b.UnitType != null ? b.UnitType.Name : null, b.Code, b.Name, b.Description, b.DisplayOrder, b.IsActive, b.Progressions.Count(p => !p.IsDeleted)))
            .ToListAsync(ct);
    }
}

// Active list for pickers. Global=true → ONLY global (no-unit-type) badges; otherwise ONLY that unit type's own.
public record GetBadgeListQuery(Guid? UnitTypeId, bool Global = false) : IRequest<IReadOnlyList<BadgeListDto>>;

public class GetBadgeListQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBadgeListQuery, IReadOnlyList<BadgeListDto>>
{
    public async ValueTask<IReadOnlyList<BadgeListDto>> Handle(GetBadgeListQuery request, CancellationToken ct)
    {
        var query = request.Global
            ? context.Badges.Where(b => b.UnitTypeId == null && b.IsActive)
            : context.Badges.Where(b => b.UnitTypeId == request.UnitTypeId && b.IsActive);
        return await query
            .OrderBy(b => b.DisplayOrder).ThenBy(b => b.Name)
            .Select(b => new BadgeListDto(b.Id, b.Code, b.Name))
            .ToListAsync(ct);
    }
}

// UnitTypeId null = a GLOBAL badge (available to every unit type).
public record CreateBadgeCommand(Guid? UnitTypeId, string Code, string Name, string? Description, int DisplayOrder, bool IsActive) : IRequest<Result<Guid>>;

public class CreateBadgeCommandValidator : AbstractValidator<CreateBadgeCommand>
{
    public CreateBadgeCommandValidator()
    {
        // Code optional: auto-generated from the name when left blank (inline add).
        RuleFor(x => x.Code).MaximumLength(50).NoHtml();
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
        // UnitTypeId optional: null = global.
    }
}

public class CreateBadgeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateBadgeCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateBadgeCommand request, CancellationToken ct)
    {
        var code = await ProgressionCodes.ResolveAsync(
            request.Code, request.Name,
            c => context.Badges.AnyAsync(b => b.UnitTypeId == request.UnitTypeId && b.Code == c, ct), "badge");
        if (code is null) return Result<Guid>.Failure(request.UnitTypeId is null ? "Un badge global avec ce code existe déjà." : "Un badge avec ce code existe déjà pour ce type d'unité.");

        var entity = new Badge
        {
            UnitTypeId = request.UnitTypeId,
            Code = code,
            Name = request.Name,
            Description = request.Description,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive
        };

        context.Badges.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "Badge", entity.Id, newValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

public record UpdateBadgeCommand(Guid Id, string Code, string Name, string? Description, int DisplayOrder, bool IsActive) : IRequest<Result<bool>>;

public class UpdateBadgeCommandValidator : AbstractValidator<UpdateBadgeCommand>
{
    public UpdateBadgeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50).NoHtml();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
    }
}

public class UpdateBadgeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateBadgeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateBadgeCommand request, CancellationToken ct)
    {
        var entity = await context.Badges.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Badge introuvable.");

        var exists = await context.Badges.AnyAsync(b => b.UnitTypeId == entity.UnitTypeId && b.Code == request.Code && b.Id != request.Id, ct);
        if (exists) return Result<bool>.Failure("Un badge avec ce code existe déjà pour ce type d'unité.");

        var oldValues = new { entity.Code, entity.Name, entity.IsActive };
        entity.Code = request.Code;
        entity.Name = request.Name;
        entity.Description = request.Description;
        entity.DisplayOrder = request.DisplayOrder;
        entity.IsActive = request.IsActive;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "Badge", entity.Id, oldValues: oldValues, newValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteBadgeCommand(Guid Id) : IRequest<Result<bool>>;

// If the badge has been awarded to any member, it is ARCHIVED (IsActive=false → hidden from the
// dropdowns but kept so it still shows on those members) instead of deleted. Unused badges are
// hard-deleted. Result value = true when archived, false when deleted.
public class DeleteBadgeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteBadgeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteBadgeCommand request, CancellationToken ct)
    {
        var entity = await context.Badges.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Badge introuvable.");

        var used = await context.MemberProgressions.AnyAsync(p => p.BadgeId == request.Id, ct);
        if (used)
        {
            if (entity.IsActive)
            {
                entity.IsActive = false;
                await context.SaveChangesAsync(ct);
                await auditService.LogAsync("Archive", "Badge", entity.Id, oldValues: new { entity.Code, entity.Name }, cancellationToken: ct);
            }
            return Result<bool>.Success(true); // archived
        }

        context.Badges.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "Badge", entity.Id, oldValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<bool>.Success(false); // deleted
    }
}

// Reorder badges
public record ReorderBadgesCommand(List<Guid> OrderedIds) : IRequest<Result<bool>>;

public class ReorderBadgesCommandValidator : AbstractValidator<ReorderBadgesCommand>
{
    public ReorderBadgesCommandValidator()
        => RuleFor(x => x.OrderedIds).NotNull().Must(l => l.Count <= 1000).WithMessage("Trop d'éléments.");
}

public class ReorderBadgesCommandHandler(IApplicationDbContext context) : IRequestHandler<ReorderBadgesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReorderBadgesCommand request, CancellationToken ct)
    {
        var badges = await context.Badges.Where(b => request.OrderedIds.Contains(b.Id)).ToListAsync(ct);
        for (var i = 0; i < request.OrderedIds.Count; i++)
        {
            var badge = badges.FirstOrDefault(b => b.Id == request.OrderedIds[i]);
            if (badge is not null) badge.DisplayOrder = i;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ─── Member Progression ────────────────────

// Get progressions for a member
public record GetMemberProgressionsQuery(Guid MemberId) : IRequest<Result<IReadOnlyList<MemberProgressionDto>>>;

public class GetMemberProgressionsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetMemberProgressionsQuery, Result<IReadOnlyList<MemberProgressionDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberProgressionDto>>> Handle(GetMemberProgressionsQuery request, CancellationToken ct)
    {
        // Access check: own member, or a leader (members.edit) of the member's unit. A read-only youth
        // holds progression.view + their own unit in AuthorizedUnitIds, so a unit-only check would let
        // them read co-members' progression — hence the members.edit gate baked into MemberAccess.
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<IReadOnlyList<MemberProgressionDto>>.Failure("Accès non autorisé.");

        var items = await context.MemberProgressions
            .Where(p => p.MemberId == request.MemberId)
            .OrderByDescending(p => p.Date)
            .Select(p => new MemberProgressionDto(
                p.Id, p.MemberId, p.UnitId, p.Unit != null ? p.Unit.Name : null,
                p.ScoutStageId, p.ScoutStage.Code, p.ScoutStage.Name,
                p.BadgeId, p.Badge != null ? p.Badge.Code : null, p.Badge != null ? p.Badge.Name : null,
                p.Date, p.Location, p.Notes, p.CreatedAt
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<MemberProgressionDto>>.Success(items);
    }
}

// Create progression. UnitId is null for a GLOBAL stage ("Général" — no unit).
public record CreateMemberProgressionCommand(Guid MemberId, Guid? UnitId, Guid ScoutStageId, Guid? BadgeId, DateOnly Date, string? Location, string? Notes) : IRequest<Result<Guid>>;

public class CreateMemberProgressionCommandValidator : AbstractValidator<CreateMemberProgressionCommand>
{
    public CreateMemberProgressionCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        // UnitId optional: null = a global-stage progression (recorded outside any unit).
        RuleFor(x => x.ScoutStageId).NotEmpty().WithMessage("L'étape est requise.");
        RuleFor(x => x.Location).MaximumLength(200).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000).NoHtml();
        RuleFor(x => x.Date).LessThanOrEqualTo(_ => LebanonClock.Today.AddDays(1))
            .WithMessage("La date ne peut pas être dans le futur.");
    }
}

public class CreateMemberProgressionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<CreateMemberProgressionCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateMemberProgressionCommand request, CancellationToken ct)
    {
        var stage = await context.ScoutStages.FindAsync([request.ScoutStageId], ct);
        if (stage is null) return Result<Guid>.Failure("Étape introuvable.");

        // A GLOBAL stage (no unit type) is recorded WITHOUT a unit ("Général"); a per-type stage keeps its unit.
        // Deterministic from the stage, so a mismatched UnitId from the client can't create bad data.
        var isGlobalStage = stage.UnitTypeId is null;
        var unitId = isGlobalStage ? (Guid?)null : request.UnitId;

        // Access model: the caller must be able to MANAGE this member — a leader of the member's CURRENT
        // unit (an active assignment in one of the caller's authorized units). They may then record a
        // progression against ANY unit the member has belonged to (current OR past), so a stage/badge earned
        // in a PREVIOUS unit can be added retroactively even though the caller doesn't lead that past unit.
        // (The controller already requires progression.manage.)
        if (!currentUser.IsSuperAdmin)
        {
            var canManageMember = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && a.EndDate == null && !a.IsDeleted && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canManageMember)
                return Result<Guid>.Failure("Accès non autorisé à ce membre.");

            // For a per-type stage the target unit must be one the member actually belonged to (prevents writing
            // against an arbitrary unit the member was never in). A global stage has no unit, so this is skipped.
            if (!isGlobalStage)
            {
                if (unitId is null) return Result<Guid>.Failure("L'unité est requise.");
                var memberInUnit = await context.MemberAssignments.AnyAsync(a =>
                    a.MemberId == request.MemberId && a.UnitId == unitId && !a.IsDeleted, ct);
                if (!memberInUnit)
                    return Result<Guid>.Failure("Ce membre n'appartient pas à cette unité.");
            }
        }
        else if (!isGlobalStage && unitId is null)
        {
            return Result<Guid>.Failure("L'unité est requise.");
        }

        // A badge-stage records an awarded badge, so the BadgeId is mandatory for those stages.
        if (stage.IsBadgeStage && request.BadgeId is null)
            return Result<Guid>.Failure("Un badge est requis pour cette étape.");

        var entity = new MemberProgression
        {
            MemberId = request.MemberId,
            UnitId = unitId,
            ScoutStageId = request.ScoutStageId,
            BadgeId = request.BadgeId,
            Date = request.Date,
            Location = request.Location,
            Notes = request.Notes
        };

        context.MemberProgressions.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "MemberProgression", entity.Id, newValues: new { Stage = stage.Name, entity.Date }, cancellationToken: ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// Delete progression
public record DeleteMemberProgressionCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMemberProgressionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<DeleteMemberProgressionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMemberProgressionCommand request, CancellationToken ct)
    {
        var entity = await context.MemberProgressions.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Progression introuvable.");

        // Same model as create: a leader who MANAGES the member (member active in one of the caller's units)
        // may delete any of that member's progressions, including ones recorded against a PAST unit.
        if (!currentUser.IsSuperAdmin)
        {
            var canManageMember = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && !a.IsDeleted && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canManageMember)
                return Result<bool>.Failure("Accès non autorisé.");
        }

        context.MemberProgressions.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "MemberProgression", entity.Id, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Update progression — lets a manager correct an existing entry (unit / stage / badge / date / location / notes)
// instead of delete-and-recreate. Same access model as create/delete.
public record UpdateMemberProgressionCommand(Guid Id, Guid? UnitId, Guid ScoutStageId, Guid? BadgeId, DateOnly Date, string? Location, string? Notes) : IRequest<Result<bool>>;

public class UpdateMemberProgressionCommandValidator : AbstractValidator<UpdateMemberProgressionCommand>
{
    public UpdateMemberProgressionCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        // UnitId optional: null = a global-stage progression.
        RuleFor(x => x.ScoutStageId).NotEmpty().WithMessage("L'étape est requise.");
        RuleFor(x => x.Location).MaximumLength(200).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000).NoHtml();
        RuleFor(x => x.Date).LessThanOrEqualTo(_ => LebanonClock.Today.AddDays(1))
            .WithMessage("La date ne peut pas être dans le futur.");
    }
}

public class UpdateMemberProgressionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<UpdateMemberProgressionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMemberProgressionCommand request, CancellationToken ct)
    {
        var entity = await context.MemberProgressions.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Progression introuvable.");

        var stage = await context.ScoutStages.FindAsync([request.ScoutStageId], ct);
        if (stage is null) return Result<bool>.Failure("Étape introuvable.");
        if (stage.IsBadgeStage && request.BadgeId is null)
            return Result<bool>.Failure("Un badge est requis pour cette étape.");

        // Global stage (no unit type) → recorded without a unit; per-type stage keeps its unit.
        var isGlobalStage = stage.UnitTypeId is null;
        var unitId = isGlobalStage ? (Guid?)null : request.UnitId;

        // Same model as create/delete: a leader who MANAGES the member (member active in one of the caller's
        // units); for a per-type stage the target unit must be one the member belonged to (current or past).
        if (!currentUser.IsSuperAdmin)
        {
            var canManageMember = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && !a.IsDeleted && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canManageMember) return Result<bool>.Failure("Accès non autorisé.");

            if (!isGlobalStage)
            {
                if (unitId is null) return Result<bool>.Failure("L'unité est requise.");
                var memberInUnit = await context.MemberAssignments.AnyAsync(a =>
                    a.MemberId == entity.MemberId && a.UnitId == unitId && !a.IsDeleted, ct);
                if (!memberInUnit) return Result<bool>.Failure("Ce membre n'appartient pas à cette unité.");
            }
        }
        else if (!isGlobalStage && unitId is null)
        {
            return Result<bool>.Failure("L'unité est requise.");
        }

        entity.UnitId = unitId;
        entity.ScoutStageId = request.ScoutStageId;
        entity.BadgeId = stage.IsBadgeStage ? request.BadgeId : null;
        entity.Date = request.Date;
        entity.Location = request.Location;
        entity.Notes = request.Notes;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "MemberProgression", entity.Id, newValues: new { Stage = stage.Name, entity.Date }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
