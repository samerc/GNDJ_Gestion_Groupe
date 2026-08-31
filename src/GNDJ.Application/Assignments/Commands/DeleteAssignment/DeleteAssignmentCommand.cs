using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Assignments.Commands.DeleteAssignment;

// Removes an assignment entirely (correcting a mistake — use EndAssignment to retire one normally).
// Unit-scoped to the assignment's unit.
public record DeleteAssignmentCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteAssignmentCommandHandler : IRequestHandler<DeleteAssignmentCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public DeleteAssignmentCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(DeleteAssignmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAssignments.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Affectation introuvable.");

        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        // Readable snapshot of what's being removed (names, not GUIDs) — resolved before the delete.
        var snapshot = await GNDJ.Application.Assignments.AssignmentAudit.DescribeAsync(_context, entity.MemberId,
            entity.UnitId, entity.TeamId, entity.FunctionalRoleId, entity.StartDate, entity.EndDate, cancellationToken);

        _context.MemberAssignments.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "MemberAssignment", entity.Id,
            oldValues: snapshot, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
