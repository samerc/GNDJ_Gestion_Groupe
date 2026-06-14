using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypes.Commands.UpdateUnitType;

public record UpdateUnitTypeCommand(Guid Id, string Name, string Code, string? Description, int? NumberOfYears, int? AgeMin, int? AgeMax, string? Color, string? PublicDescription = null) : IRequest<Result<bool>>;

public class UpdateUnitTypeCommandValidator : AbstractValidator<UpdateUnitTypeCommand>
{
    public UpdateUnitTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.PublicDescription).MaximumLength(4000).NoHtml();
        RuleFor(x => x.Color).MaximumLength(10).HexColor();
        RuleFor(x => x.NumberOfYears).GreaterThan(0).LessThanOrEqualTo(20).When(x => x.NumberOfYears.HasValue).WithMessage("Le nombre d'années doit être positif.");
        RuleFor(x => x.AgeMin).InclusiveBetween(3, 99).When(x => x.AgeMin.HasValue);
        RuleFor(x => x.AgeMax).InclusiveBetween(3, 99).When(x => x.AgeMax.HasValue);
        RuleFor(x => x).Must(x => x.AgeMin <= x.AgeMax).When(x => x.AgeMin.HasValue && x.AgeMax.HasValue)
            .WithMessage("L'âge minimum doit être inférieur ou égal à l'âge maximum.");
    }
}

public class UpdateUnitTypeCommandHandler : IRequestHandler<UpdateUnitTypeCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateUnitTypeCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateUnitTypeCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.UnitTypes.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Type d'unité introuvable.");

        var codeExists = await _context.UnitTypes.AnyAsync(ut => ut.Code == request.Code && ut.Id != request.Id, cancellationToken);
        if (codeExists)
            return Result<bool>.Failure("Un type d'unité avec ce code existe déjà.");

        if (!string.IsNullOrWhiteSpace(request.Color))
        {
            var colorExists = await _context.UnitTypes.AnyAsync(ut => ut.Color == request.Color && ut.Id != request.Id, cancellationToken);
            if (colorExists)
                return Result<bool>.Failure("Cette couleur est déjà utilisée par un autre type d'unité.");
        }

        var oldValues = new { entity.Name, entity.Code, entity.Description, entity.NumberOfYears };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.NumberOfYears = request.NumberOfYears;
        entity.AgeMin = request.AgeMin;
        entity.AgeMax = request.AgeMax;
        entity.Color = request.Color;
        entity.PublicDescription = string.IsNullOrWhiteSpace(request.PublicDescription) ? null : request.PublicDescription.Trim();

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "UnitType", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.Description, entity.NumberOfYears }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
