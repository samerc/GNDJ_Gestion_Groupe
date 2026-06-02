using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Commands.UpdateUnit;

public record UpdateUnitCommand(Guid Id, string Name, string Code, string? Description, Guid AssociationId, Guid UnitTypeId, bool IsActive) : IRequest<Result<bool>>;

public class UpdateUnitCommandValidator : AbstractValidator<UpdateUnitCommand>
{
    public UpdateUnitCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50);
        RuleFor(x => x.AssociationId).NotEmpty().WithMessage("L'association est requise.");
        RuleFor(x => x.UnitTypeId).NotEmpty().WithMessage("Le type d'unité est requis.");
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

        var oldValues = new { entity.Name, entity.Code, entity.Description, entity.IsActive };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.AssociationId = request.AssociationId;
        entity.UnitTypeId = request.UnitTypeId;
        entity.IsActive = request.IsActive;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Unit", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.Description, entity.IsActive }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
