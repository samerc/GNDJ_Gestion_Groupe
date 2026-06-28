using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeleteMember;

// Hard-deletes a member (soft-deleted via the SoftDelete interceptor). Blocked when the member still
// has an active assignment — end their assignments first. Unit-scoped + super-admin only.
public record DeleteMemberCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMemberCommandHandler : IRequestHandler<DeleteMemberCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public DeleteMemberCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(DeleteMemberCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Members
            .Include(m => m.Assignments)
            .FirstOrDefaultAsync(m => m.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Membre introuvable.");

        // Authorization: super admin can delete anyone; a unit leader may only delete a member
        // who belongs (via any assignment) to one of their authorized units.
        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            var hasAccess = entity.Assignments.Any(a => !a.IsDeleted && authorizedUnitIds.Contains(a.UnitId));
            if (!hasAccess)
                return Result<bool>.Failure("Accès non autorisé à ce membre.");
        }

        if (entity.Assignments.Any(a => a.EndDate == null && !a.IsDeleted))
            return Result<bool>.Failure("Impossible de supprimer un membre qui a des affectations actives.");

        _context.Members.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "Member", entity.Id, oldValues: new { entity.FirstName, entity.LastName }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
