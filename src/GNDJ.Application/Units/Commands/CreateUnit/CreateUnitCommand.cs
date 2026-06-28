using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Commands.CreateUnit;

// Create a unit. AssociationId is optional (inter-association / no-association units). Code is unique
// per association scope — the same code may exist under a different (or null) association.
public record CreateUnitCommand(string Name, string Code, string? Description, Guid? AssociationId, Guid UnitTypeId) : IRequest<Result<Guid>>;

public class CreateUnitCommandValidator : AbstractValidator<CreateUnitCommand>
{
    public CreateUnitCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        // Association optional: a unit may span both associations (e.g. Maîtrise de Groupe) and belong to none.
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
