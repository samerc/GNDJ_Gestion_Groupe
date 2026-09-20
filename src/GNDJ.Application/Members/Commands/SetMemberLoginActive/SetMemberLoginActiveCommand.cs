using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.SetMemberLoginActive;

// Enable/disable a member's login WITHOUT deleting the member (unlike DeleteMember, which soft-deletes the whole
// member). Disabling sets User.IsActive=false and clears the refresh token, so the account can no longer sign in
// (any live session dies within ≤15 min when its access token expires) but the member record + all their data
// stay intact and visible. Re-enabling flips it back. Used to lock out e.g. orphan accounts (a login with no
// assignment) or a leaver, while keeping their history. Access = super-admin / group manager / an active leader
// of the member's unit (same policy as the member panel).
public record SetMemberLoginActiveCommand(Guid MemberId, bool Active) : IRequest<Result<bool>>;

public class SetMemberLoginActiveCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IAuditService auditService
) : IRequestHandler<SetMemberLoginActiveCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetMemberLoginActiveCommand request, CancellationToken ct)
    {
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        var user = await context.Users.FirstOrDefaultAsync(u => u.MemberId == request.MemberId, ct);
        if (user is null)
            return Result<bool>.Failure("Ce membre n'a pas de compte utilisateur.");

        if (user.IsActive == request.Active)
            return Result<bool>.Success(true); // already in the requested state — no-op

        user.IsActive = request.Active;
        if (!request.Active)
        {
            // Kill any active session so the disable takes effect (access token dies within ≤15 min).
            user.RefreshToken = null;
            user.RefreshTokenExpiry = null;
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync(
            request.Active ? "EnableLogin" : "DisableLogin", "User", user.Id,
            newValues: new { user.Email, user.IsActive }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
