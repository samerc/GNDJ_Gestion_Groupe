using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypes.Commands.CreateUnitType;

public record CreateUnitTypeCommand(string Name, string Code, string? Description, int? NumberOfYears, int? AgeMin, int? AgeMax, string? Color, string? PublicDescription = null) : IRequest<Result<Guid>>;

public class CreateUnitTypeCommandValidator : AbstractValidator<CreateUnitTypeCommand>
{
    public CreateUnitTypeCommandValidator()
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

public class CreateUnitTypeCommandHandler : IRequestHandler<CreateUnitTypeCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public CreateUnitTypeCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<Guid>> Handle(CreateUnitTypeCommand request, CancellationToken cancellationToken)
    {
        var codeExists = await _context.UnitTypes.AnyAsync(ut => ut.Code == request.Code, cancellationToken);
        if (codeExists)
            return Result<Guid>.Failure("Un type d'unité avec ce code existe déjà.");

        if (!string.IsNullOrWhiteSpace(request.Color))
        {
            var colorExists = await _context.UnitTypes.AnyAsync(ut => ut.Color == request.Color, cancellationToken);
            if (colorExists)
                return Result<Guid>.Failure("Cette couleur est déjà utilisée par un autre type d'unité.");
        }

        var entity = new UnitType
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description,
            NumberOfYears = request.NumberOfYears,
            AgeMin = request.AgeMin,
            AgeMax = request.AgeMax,
            Color = request.Color,
            PublicDescription = string.IsNullOrWhiteSpace(request.PublicDescription) ? null : request.PublicDescription.Trim()
        };

        _context.UnitTypes.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "UnitType", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}
