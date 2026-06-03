using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Progression;

// ─── DTOs ──────────────────────────────────
public record ScoutStageDto(Guid Id, Guid UnitTypeId, string UnitTypeName, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, bool IsBadgeStage, int ProgressionCount);
public record BadgeDto(Guid Id, Guid UnitTypeId, string UnitTypeName, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, int ProgressionCount);
public record ScoutStageListDto(Guid Id, string Code, string Name, bool IsBadgeStage);
public record BadgeListDto(Guid Id, string Code, string Name);

public record MemberProgressionDto(
    Guid Id, Guid MemberId, Guid UnitId, string UnitName,
    Guid ScoutStageId, string ScoutStageCode, string ScoutStageName,
    Guid? BadgeId, string? BadgeCode, string? BadgeName,
    DateOnly Date, string? Location, string? Notes, DateTime CreatedAt
);

// ─── Scout Stage CRUD ──────────────────────

// GetAll by unit type
public record GetScoutStagesQuery(Guid? UnitTypeId) : IRequest<IReadOnlyList<ScoutStageDto>>;

public class GetScoutStagesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetScoutStagesQuery, IReadOnlyList<ScoutStageDto>>
{
    public async ValueTask<IReadOnlyList<ScoutStageDto>> Handle(GetScoutStagesQuery request, CancellationToken ct)
    {
        var query = context.ScoutStages.AsQueryable();
        if (request.UnitTypeId.HasValue)
            query = query.Where(s => s.UnitTypeId == request.UnitTypeId.Value);

        return await query
            .OrderBy(s => s.UnitType.Name).ThenBy(s => s.DisplayOrder).ThenBy(s => s.Name)
            .Select(s => new ScoutStageDto(s.Id, s.UnitTypeId, s.UnitType.Name, s.Code, s.Name, s.Description, s.DisplayOrder, s.IsActive, s.IsBadgeStage, s.Progressions.Count(p => !p.IsDeleted)))
            .ToListAsync(ct);
    }
}

// Active list for dropdowns (filtered by unit type)
public record GetScoutStageListQuery(Guid UnitTypeId) : IRequest<IReadOnlyList<ScoutStageListDto>>;

public class GetScoutStageListQueryHandler(IApplicationDbContext context) : IRequestHandler<GetScoutStageListQuery, IReadOnlyList<ScoutStageListDto>>
{
    public async ValueTask<IReadOnlyList<ScoutStageListDto>> Handle(GetScoutStageListQuery request, CancellationToken ct)
    {
        return await context.ScoutStages
            .Where(s => s.UnitTypeId == request.UnitTypeId && s.IsActive)
            .OrderBy(s => s.DisplayOrder).ThenBy(s => s.Name)
            .Select(s => new ScoutStageListDto(s.Id, s.Code, s.Name, s.IsBadgeStage))
            .ToListAsync(ct);
    }
}

// Create
public record CreateScoutStageCommand(Guid UnitTypeId, string Code, string Name, string? Description, int DisplayOrder, bool IsActive, bool IsBadgeStage) : IRequest<Result<Guid>>;

public class CreateScoutStageCommandValidator : AbstractValidator<CreateScoutStageCommand>
{
    public CreateScoutStageCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.UnitTypeId).NotEmpty().WithMessage("Le type d'unité est requis.");
    }
}

public class CreateScoutStageCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateScoutStageCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateScoutStageCommand request, CancellationToken ct)
    {
        var exists = await context.ScoutStages.AnyAsync(s => s.UnitTypeId == request.UnitTypeId && s.Code == request.Code, ct);
        if (exists) return Result<Guid>.Failure("Une étape avec ce code existe déjà pour ce type d'unité.");

        var entity = new ScoutStage
        {
            UnitTypeId = request.UnitTypeId,
            Code = request.Code,
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

public class DeleteScoutStageCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteScoutStageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteScoutStageCommand request, CancellationToken ct)
    {
        var entity = await context.ScoutStages.Include(s => s.Progressions).FirstOrDefaultAsync(s => s.Id == request.Id, ct);
        if (entity is null) return Result<bool>.Failure("Étape introuvable.");
        if (entity.Progressions.Any()) return Result<bool>.Failure("Impossible de supprimer une étape utilisée par des progressions.");

        context.ScoutStages.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "ScoutStage", entity.Id, oldValues: new { entity.Code, entity.Name }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ─── Badge CRUD ────────────────────────────

public record GetBadgesQuery(Guid? UnitTypeId) : IRequest<IReadOnlyList<BadgeDto>>;

public class GetBadgesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBadgesQuery, IReadOnlyList<BadgeDto>>
{
    public async ValueTask<IReadOnlyList<BadgeDto>> Handle(GetBadgesQuery request, CancellationToken ct)
    {
        var query = context.Badges.AsQueryable();
        if (request.UnitTypeId.HasValue)
            query = query.Where(b => b.UnitTypeId == request.UnitTypeId.Value);

        return await query
            .OrderBy(b => b.UnitType.Name).ThenBy(b => b.DisplayOrder).ThenBy(b => b.Name)
            .Select(b => new BadgeDto(b.Id, b.UnitTypeId, b.UnitType.Name, b.Code, b.Name, b.Description, b.DisplayOrder, b.IsActive, b.Progressions.Count(p => !p.IsDeleted)))
            .ToListAsync(ct);
    }
}

// Active list for dropdowns
public record GetBadgeListQuery(Guid UnitTypeId) : IRequest<IReadOnlyList<BadgeListDto>>;

public class GetBadgeListQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBadgeListQuery, IReadOnlyList<BadgeListDto>>
{
    public async ValueTask<IReadOnlyList<BadgeListDto>> Handle(GetBadgeListQuery request, CancellationToken ct)
    {
        return await context.Badges
            .Where(b => b.UnitTypeId == request.UnitTypeId && b.IsActive)
            .OrderBy(b => b.DisplayOrder).ThenBy(b => b.Name)
            .Select(b => new BadgeListDto(b.Id, b.Code, b.Name))
            .ToListAsync(ct);
    }
}

public record CreateBadgeCommand(Guid UnitTypeId, string Code, string Name, string? Description, int DisplayOrder, bool IsActive) : IRequest<Result<Guid>>;

public class CreateBadgeCommandValidator : AbstractValidator<CreateBadgeCommand>
{
    public CreateBadgeCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.UnitTypeId).NotEmpty().WithMessage("Le type d'unité est requis.");
    }
}

public class CreateBadgeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateBadgeCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateBadgeCommand request, CancellationToken ct)
    {
        var exists = await context.Badges.AnyAsync(b => b.UnitTypeId == request.UnitTypeId && b.Code == request.Code, ct);
        if (exists) return Result<Guid>.Failure("Un badge avec ce code existe déjà pour ce type d'unité.");

        var entity = new Badge
        {
            UnitTypeId = request.UnitTypeId,
            Code = request.Code,
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

public class DeleteBadgeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteBadgeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteBadgeCommand request, CancellationToken ct)
    {
        var entity = await context.Badges.Include(b => b.Progressions).FirstOrDefaultAsync(b => b.Id == request.Id, ct);
        if (entity is null) return Result<bool>.Failure("Badge introuvable.");
        if (entity.Progressions.Any()) return Result<bool>.Failure("Impossible de supprimer un badge utilisé par des progressions.");

        context.Badges.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "Badge", entity.Id, oldValues: new { entity.Code, entity.Name }, cancellationToken: ct);
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
        // Access check: own member or unit-scoped
        if (!currentUser.IsSuperAdmin && currentUser.MemberId != request.MemberId)
        {
            var canAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && a.EndDate == null && currentUser.AuthorizedUnitIds.Contains(a.UnitId), ct);
            if (!canAccess) return Result<IReadOnlyList<MemberProgressionDto>>.Failure("Accès non autorisé.");
        }

        var items = await context.MemberProgressions
            .Where(p => p.MemberId == request.MemberId)
            .OrderByDescending(p => p.Date)
            .Select(p => new MemberProgressionDto(
                p.Id, p.MemberId, p.UnitId, p.Unit.Name,
                p.ScoutStageId, p.ScoutStage.Code, p.ScoutStage.Name,
                p.BadgeId, p.Badge != null ? p.Badge.Code : null, p.Badge != null ? p.Badge.Name : null,
                p.Date, p.Location, p.Notes, p.CreatedAt
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<MemberProgressionDto>>.Success(items);
    }
}

// Create progression
public record CreateMemberProgressionCommand(Guid MemberId, Guid UnitId, Guid ScoutStageId, Guid? BadgeId, DateOnly Date, string? Location, string? Notes) : IRequest<Result<Guid>>;

public class CreateMemberProgressionCommandValidator : AbstractValidator<CreateMemberProgressionCommand>
{
    public CreateMemberProgressionCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.UnitId).NotEmpty().WithMessage("L'unité est requise.");
        RuleFor(x => x.ScoutStageId).NotEmpty().WithMessage("L'étape est requise.");
    }
}

public class CreateMemberProgressionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<CreateMemberProgressionCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateMemberProgressionCommand request, CancellationToken ct)
    {
        // Unit-scoped access
        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<Guid>.Failure("Accès non autorisé à cette unité.");

        var stage = await context.ScoutStages.FindAsync([request.ScoutStageId], ct);
        if (stage is null) return Result<Guid>.Failure("Étape introuvable.");

        if (stage.IsBadgeStage && request.BadgeId is null)
            return Result<Guid>.Failure("Un badge est requis pour cette étape.");

        var entity = new MemberProgression
        {
            MemberId = request.MemberId,
            UnitId = request.UnitId,
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

        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé.");

        context.MemberProgressions.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "MemberProgression", entity.Id, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
