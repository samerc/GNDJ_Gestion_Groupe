using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Assignments.Commands.EndAssignment;

// Closes an open assignment by setting its EndDate (the "Terminer" action) — keeps it as history
// rather than deleting it. Rejects an already-ended assignment or an EndDate before the start.
public record EndAssignmentCommand(Guid Id, DateOnly EndDate) : IRequest<Result<bool>>;

public class EndAssignmentCommandHandler : IRequestHandler<EndAssignmentCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public EndAssignmentCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(EndAssignmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAssignments.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Affectation introuvable.");

        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        if (entity.EndDate is not null)
            return Result<bool>.Failure("Cette affectation est déjà terminée.");

        if (request.EndDate < entity.StartDate)
            return Result<bool>.Failure("La date de fin doit être postérieure à la date de début.");

        // Readable BEFORE snapshot (still open — no end date) then AFTER (with the end date).
        var oldSnapshot = await GNDJ.Application.Assignments.AssignmentAudit.DescribeAsync(_context, entity.MemberId,
            entity.UnitId, entity.TeamId, entity.FunctionalRoleId, entity.StartDate, null, cancellationToken);

        entity.EndDate = request.EndDate;

        await _context.SaveChangesAsync(cancellationToken);
        var newSnapshot = await GNDJ.Application.Assignments.AssignmentAudit.DescribeAsync(_context, entity.MemberId,
            entity.UnitId, entity.TeamId, entity.FunctionalRoleId, entity.StartDate, entity.EndDate, cancellationToken);
        await _auditService.LogAsync("Update", "MemberAssignment", entity.Id,
            oldValues: oldSnapshot, newValues: newSnapshot, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
