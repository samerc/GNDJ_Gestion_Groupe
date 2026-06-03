using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Teams.Commands.DeleteTeam;

public record DeleteTeamCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteTeamCommandHandler : IRequestHandler<DeleteTeamCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public DeleteTeamCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(DeleteTeamCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Teams
            .Include(t => t.Assignments.Where(a => a.EndDate == null))
            .FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Équipe introuvable.");

        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        if (entity.Assignments.Any())
            return Result<bool>.Failure("Impossible de supprimer une équipe qui contient des membres actifs.");

        _context.Teams.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "Team", entity.Id, oldValues: new { entity.Name, entity.UnitId }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
