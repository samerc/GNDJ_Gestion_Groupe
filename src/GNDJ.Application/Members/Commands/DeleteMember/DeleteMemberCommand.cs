using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeleteMember;

// Soft-deletes a member (via the SoftDelete interceptor) AND disables their login immediately, so a removed
// member can neither be seen nor sign in during the recovery window. Connected data (contacts, guardians,
// documents, cotisations, progressions, ended assignments) is left intact but hidden, so the member is fully
// restorable until a background job PERMANENTLY purges them after the retention window (member.purge_after_days,
// default 30). Blocked when the member still has an active assignment — end their assignments first.
// Unit-scoped + members.delete.
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
        // NOTE: load the member ALONE — no Include(User) and no Include(Assignments). Both are REQUIRED children
        // (non-nullable MemberId): if either is tracked when we Remove the Member (principal), EF tries to sever the
        // required relationship and throws ("association … severed … required") → 500. That hit every member with
        // past (ended) assignments. The assignment facts are read with separate queries; the login is disabled
        // with a set-based update below.
        var entity = await _context.Members.FirstOrDefaultAsync(m => m.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Membre introuvable.");

        var assignments = await _context.MemberAssignments
            .Where(a => a.MemberId == entity.Id && !a.IsDeleted)
            .Select(a => new { a.UnitId, a.EndDate })
            .ToListAsync(cancellationToken);

        // Authorization: super admin can delete anyone; a unit leader may only delete a member
        // who belongs (via any assignment) to one of their authorized units.
        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            var hasAccess = assignments.Any(a => authorizedUnitIds.Contains(a.UnitId));
            if (!hasAccess)
                return Result<bool>.Failure("Accès non autorisé à ce membre.");
        }

        if (assignments.Any(a => a.EndDate == null))
            return Result<bool>.Failure("Impossible de supprimer un membre qui a des affectations actives.");

        // Disable the login immediately so the removed member can't sign in during the recovery window (and clear
        // the refresh token to kill any live session on its next refresh). Done as a SET-BASED update (untracked)
        // to avoid the required-FK sever described above; no-op if the member has no account. The User row is kept
        // (not soft-deleted) so a restore just re-enables it; the purge job deletes it for good later. Login is
        // also blocked regardless, because the login handler treats a soft-deleted member (Member == null) as a
        // failure — so a crash between these two writes can't leave the account usable.
        await _context.Users
            .Where(u => u.MemberId == entity.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false), cancellationToken);
        await _context.UserSessions.Where(s => s.User.MemberId == entity.Id).ExecuteDeleteAsync(cancellationToken);

        _context.Members.Remove(entity); // interceptor → soft-delete (IsDeleted + DeletedAt)
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "Member", entity.Id, oldValues: new { entity.FirstName, entity.LastName }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
