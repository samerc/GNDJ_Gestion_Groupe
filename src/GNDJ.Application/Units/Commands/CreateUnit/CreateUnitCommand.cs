using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Commands.CreateUnit;

public record CreateUnitCommand(string Name, string Code, string? Description, Guid AssociationId, Guid UnitTypeId) : IRequest<Result<Guid>>;

public class CreateUnitCommandValidator : AbstractValidator<CreateUnitCommand>
{
    public CreateUnitCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.AssociationId).NotEmpty().WithMessage("L'association est requise.");
        RuleFor(x => x.UnitTypeId).NotEmpty().WithMessage("Le type d'unité est requis.");
    }
}

public class CreateUnitCommandHandler : IRequestHandler<CreateUnitCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public CreateUnitCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<Guid>> Handle(CreateUnitCommand request, CancellationToken cancellationToken)
    {
        var codeExists = await _context.Units.AnyAsync(u => u.Code == request.Code && u.AssociationId == request.AssociationId, cancellationToken);
        if (codeExists)
            return Result<Guid>.Failure("Une unité avec ce code existe déjà dans cette association.");

        var entity = new Domain.Entities.Unit
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description,
            AssociationId = request.AssociationId,
            UnitTypeId = request.UnitTypeId,
            IsActive = true
        };

        _context.Units.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "Unit", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}
