using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypeProgressions;

// DTOs
public record UnitTypeProgressionDto(
    Guid Id, Guid AssociationId, Guid FromUnitTypeId, string FromUnitTypeName,
    Guid ToUnitTypeId, string ToUnitTypeName,
    string? Gender, string PathType, int DisplayOrder, string? Notes,
    int? FromAgeMin, int? FromAgeMax, int? ToAgeMin, int? ToAgeMax
);

// Get all progressions for an association (for diagram)
public record GetUnitTypeProgressionsQuery(Guid AssociationId) : IRequest<IReadOnlyList<UnitTypeProgressionDto>>;

public class GetUnitTypeProgressionsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetUnitTypeProgressionsQuery, IReadOnlyList<UnitTypeProgressionDto>>
{
    public async ValueTask<IReadOnlyList<UnitTypeProgressionDto>> Handle(GetUnitTypeProgressionsQuery request, CancellationToken ct)
    {
        return await context.UnitTypeProgressions
            .Where(p => p.AssociationId == request.AssociationId)
            .Include(p => p.FromUnitType)
            .Include(p => p.ToUnitType)
            .OrderBy(p => p.DisplayOrder)
            .Select(p => new UnitTypeProgressionDto(
                p.Id, p.AssociationId, p.FromUnitTypeId, p.FromUnitType.Name,
                p.ToUnitTypeId, p.ToUnitType.Name,
                p.Gender, p.PathType, p.DisplayOrder, p.Notes,
                p.FromUnitType.AgeMin, p.FromUnitType.AgeMax,
                p.ToUnitType.AgeMin, p.ToUnitType.AgeMax
            ))
            .ToListAsync(ct);
    }
}

// Get suggested destination for a member (used by passage)
public record GetPassageSuggestionQuery(Guid MemberId) : IRequest<Result<PassageSuggestionDto>>;
public record PassageSuggestionDto(Guid? SuggestedUnitTypeId, string? SuggestedUnitTypeName, string? Reason);

public class GetPassageSuggestionQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPassageSuggestionQuery, Result<PassageSuggestionDto>>
{
    public async ValueTask<Result<PassageSuggestionDto>> Handle(GetPassageSuggestionQuery request, CancellationToken ct)
    {
        // Get member's current assignment + gender
        var member = await context.Members.FindAsync([request.MemberId], ct);
        if (member is null) return Result<PassageSuggestionDto>.Failure("Membre introuvable.");

        var assignment = await context.MemberAssignments
            .Where(a => a.MemberId == request.MemberId && a.EndDate == null)
            .Include(a => a.Unit)
            .FirstOrDefaultAsync(ct);

        if (assignment is null)
            return Result<PassageSuggestionDto>.Success(new PassageSuggestionDto(null, null, "Aucune affectation active."));

        var currentUnitTypeId = assignment.Unit.UnitTypeId;
        var associationId = assignment.Unit.AssociationId;

        // Find matching progression paths
        var paths = await context.UnitTypeProgressions
            .Where(p => p.AssociationId == associationId && p.FromUnitTypeId == currentUnitTypeId && p.PathType == "member")
            .Include(p => p.ToUnitType)
            .OrderBy(p => p.DisplayOrder)
            .ToListAsync(ct);

        // Filter by gender
        var match = paths.FirstOrDefault(p => p.Gender == member.Gender)
            ?? paths.FirstOrDefault(p => p.Gender == null);

        if (match is null)
            return Result<PassageSuggestionDto>.Success(new PassageSuggestionDto(null, null, "Aucun parcours défini."));

        return Result<PassageSuggestionDto>.Success(new PassageSuggestionDto(
            match.ToUnitTypeId, match.ToUnitType.Name,
            $"Parcours : {match.FromUnitType?.Name ?? "?"} → {match.ToUnitType.Name}"
        ));
    }
}

// Create
public record CreateUnitTypeProgressionCommand(
    Guid AssociationId, Guid FromUnitTypeId, Guid ToUnitTypeId,
    string? Gender, string PathType, int DisplayOrder, string? Notes
) : IRequest<Result<Guid>>;

public class CreateUnitTypeProgressionCommandValidator : AbstractValidator<CreateUnitTypeProgressionCommand>
{
    public CreateUnitTypeProgressionCommandValidator()
    {
        RuleFor(x => x.AssociationId).NotEmpty().WithMessage("L'association est requise.");
        RuleFor(x => x.FromUnitTypeId).NotEmpty().WithMessage("Le type d'unité source est requis.");
        RuleFor(x => x.ToUnitTypeId).NotEmpty().WithMessage("Le type d'unité destination est requis.");
        RuleFor(x => x.PathType).NotEmpty().Must(t => t is "member" or "leader").WithMessage("Type de parcours invalide.");
        RuleFor(x => x.Gender).Must(g => string.IsNullOrEmpty(g) || g is "Masculin" or "Féminin" or "Mixte").WithMessage("Genre invalide.");
        RuleFor(x => x.Notes).MaximumLength(500).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
    }
}

public class CreateUnitTypeProgressionCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateUnitTypeProgressionCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateUnitTypeProgressionCommand request, CancellationToken ct)
    {
        var entity = new UnitTypeProgression
        {
            AssociationId = request.AssociationId,
            FromUnitTypeId = request.FromUnitTypeId,
            ToUnitTypeId = request.ToUnitTypeId,
            Gender = request.Gender,
            PathType = request.PathType,
            DisplayOrder = request.DisplayOrder,
            Notes = request.Notes
        };
        context.UnitTypeProgressions.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateUnitTypeProgressionCommand(
    Guid Id, Guid FromUnitTypeId, Guid ToUnitTypeId,
    string? Gender, string PathType, int DisplayOrder, string? Notes
) : IRequest<Result<bool>>;

public class UpdateUnitTypeProgressionCommandValidator : AbstractValidator<UpdateUnitTypeProgressionCommand>
{
    public UpdateUnitTypeProgressionCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FromUnitTypeId).NotEmpty().WithMessage("Le type d'unité source est requis.");
        RuleFor(x => x.ToUnitTypeId).NotEmpty().WithMessage("Le type d'unité destination est requis.");
        RuleFor(x => x.PathType).NotEmpty().Must(t => t is "member" or "leader").WithMessage("Type de parcours invalide.");
        RuleFor(x => x.Gender).Must(g => string.IsNullOrEmpty(g) || g is "Masculin" or "Féminin" or "Mixte").WithMessage("Genre invalide.");
        RuleFor(x => x.Notes).MaximumLength(500).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
    }
}

public class UpdateUnitTypeProgressionCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateUnitTypeProgressionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateUnitTypeProgressionCommand request, CancellationToken ct)
    {
        var entity = await context.UnitTypeProgressions.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Parcours introuvable.");

        entity.FromUnitTypeId = request.FromUnitTypeId;
        entity.ToUnitTypeId = request.ToUnitTypeId;
        entity.Gender = request.Gender;
        entity.PathType = request.PathType;
        entity.DisplayOrder = request.DisplayOrder;
        entity.Notes = request.Notes;

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteUnitTypeProgressionCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteUnitTypeProgressionCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteUnitTypeProgressionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteUnitTypeProgressionCommand request, CancellationToken ct)
    {
        var entity = await context.UnitTypeProgressions.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Parcours introuvable.");

        context.UnitTypeProgressions.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
