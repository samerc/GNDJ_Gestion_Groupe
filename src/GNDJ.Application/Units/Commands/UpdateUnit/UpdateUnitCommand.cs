using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Commands.UpdateUnit;

public record UpdateUnitCommand(
    Guid Id, string Name, string Code, string? Description, Guid AssociationId, Guid UnitTypeId, bool IsActive,
    string? Slug = null, bool IsPublished = false, DateOnly? FoundedDate = null
) : IRequest<Result<bool>>;

public class UpdateUnitCommandValidator : AbstractValidator<UpdateUnitCommand>
{
    public UpdateUnitCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.AssociationId).NotEmpty().WithMessage("L'association est requise.");
        RuleFor(x => x.UnitTypeId).NotEmpty().WithMessage("Le type d'unité est requis.");
        RuleFor(x => x.Slug).MaximumLength(120).Matches("^[a-z0-9-]*$")
            .WithMessage("Le lien (slug) ne peut contenir que des minuscules, chiffres et tirets.");
    }
}

public class UpdateUnitCommandHandler : IRequestHandler<UpdateUnitCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateUnitCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateUnitCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Units.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Unité introuvable.");

        var codeExists = await _context.Units.AnyAsync(u => u.Code == request.Code && u.AssociationId == request.AssociationId && u.Id != request.Id, cancellationToken);
        if (codeExists)
            return Result<bool>.Failure("Une unité avec ce code existe déjà dans cette association.");

        var slug = string.IsNullOrWhiteSpace(request.Slug) ? null : request.Slug.Trim().ToLowerInvariant();
        // Foolproof publishing: if a unit is published without a slug, generate one from its name so it
        // actually appears on the public site (the public list requires a slug).
        if (slug is null && request.IsPublished)
        {
            var baseSlug = ContentText.Slugify(request.Name);
            slug = baseSlug;
            for (var i = 2; await _context.Units.AnyAsync(u => u.Slug == slug && u.Id != request.Id, cancellationToken); i++)
                slug = $"{baseSlug}-{i}";
        }
        else if (slug is not null)
        {
            var slugExists = await _context.Units.AnyAsync(u => u.Slug == slug && u.Id != request.Id, cancellationToken);
            if (slugExists)
                return Result<bool>.Failure("Ce lien (slug) est déjà utilisé par une autre unité.");
        }

        var oldValues = new { entity.Name, entity.Code, entity.Description, entity.IsActive, entity.IsPublished };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.AssociationId = request.AssociationId;
        entity.UnitTypeId = request.UnitTypeId;
        entity.IsActive = request.IsActive;
        entity.Slug = slug;
        entity.IsPublished = request.IsPublished;
        entity.FoundedDate = request.FoundedDate;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Unit", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.Description, entity.IsActive }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
