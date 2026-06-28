using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Associations.Commands.DeleteAssociation;

// Delete an association — blocked while it still contains units (referential safety).
public record DeleteAssociationCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteAssociationCommandHandler : IRequestHandler<DeleteAssociationCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteAssociationCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteAssociationCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Associations
            .Include(a => a.Units)
            .FirstOrDefaultAsync(a => a.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Association introuvable.");

        if (entity.Units.Any())
            return Result<bool>.Failure("Impossible de supprimer une association qui contient des unités.");

        _context.Associations.Remove(entity); // Interceptor converts to soft-delete
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "Association", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
