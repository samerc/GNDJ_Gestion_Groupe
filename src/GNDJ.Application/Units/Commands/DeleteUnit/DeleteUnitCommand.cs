using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Commands.DeleteUnit;

public record DeleteUnitCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteUnitCommandHandler : IRequestHandler<DeleteUnitCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteUnitCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteUnitCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Units
            .Include(u => u.Assignments.Where(a => a.EndDate == null))
            .FirstOrDefaultAsync(u => u.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Unité introuvable.");

        if (entity.Assignments.Any())
            return Result<bool>.Failure("Impossible de supprimer une unité qui contient des membres actifs.");

        _context.Units.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "Unit", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
