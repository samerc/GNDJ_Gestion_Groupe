using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypes.Commands.DeleteUnitType;

public record DeleteUnitTypeCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteUnitTypeCommandHandler : IRequestHandler<DeleteUnitTypeCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteUnitTypeCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteUnitTypeCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.UnitTypes.FindAsync([request.Id], cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Type d'unité introuvable.");

        var hasUnits = await _context.Units.AnyAsync(u => u.UnitTypeId == request.Id, cancellationToken);
        if (hasUnits)
            return Result<bool>.Failure("Impossible de supprimer un type d'unité qui contient des unités.");

        _context.UnitTypes.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "UnitType", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
