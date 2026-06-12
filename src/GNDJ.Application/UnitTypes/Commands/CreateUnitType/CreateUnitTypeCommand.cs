using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypes.Commands.CreateUnitType;

public record CreateUnitTypeCommand(string Name, string Code, string? Description, int? NumberOfYears, int? AgeMin, int? AgeMax, string? Color) : IRequest<Result<Guid>>;

public class CreateUnitTypeCommandValidator : AbstractValidator<CreateUnitTypeCommand>
{
    public CreateUnitTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.NumberOfYears).GreaterThan(0).When(x => x.NumberOfYears.HasValue).WithMessage("Le nombre d'années doit être positif.");
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
            Color = request.Color
        };

        _context.UnitTypes.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "UnitType", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}
