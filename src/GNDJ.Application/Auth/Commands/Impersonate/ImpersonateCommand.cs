using GNDJ.Application.Auth.Common;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.Impersonate;

// "Voir comme" — a super-admin or Chef de Groupe mints a short-lived READ-ONLY token to see the app exactly
// as a chosen member (their Ma fiche, menu, permissions, unit scope, what they can/can't see). The token
// carries the TARGET's authorization but records the acting admin (impersonator_id) so audit stays truthful;
// every mutation is blocked server-side (ImpersonationReadOnlyMiddleware). No refresh token is issued and the
// member's own refresh token is never touched, so this never disturbs their real session.
public record ImpersonateResponse(string AccessToken, Guid MemberId, string MemberName, DateTime ExpiresAt);

public record ImpersonateCommand(Guid TargetMemberId) : IRequest<Result<ImpersonateResponse>>;

public class ImpersonateCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    ITokenService tokenService,
    IAuditService auditService
) : IRequestHandler<ImpersonateCommand, Result<ImpersonateResponse>>
{
    public async ValueTask<Result<ImpersonateResponse>> Handle(ImpersonateCommand request, CancellationToken ct)
    {
        // The endpoint is gated [HasPermission(MaitriseManage)] (super-admin OR Chef de Groupe); re-assert here
        // as defense-in-depth so the mint can never happen outside that policy.
        if (currentUser.UserId is null || !MemberAccess.IsGroupManager(currentUser))
            return Result<ImpersonateResponse>.Failure("Accès non autorisé.");

        if (request.TargetMemberId == currentUser.MemberId)
            return Result<ImpersonateResponse>.Failure("Vous ne pouvez pas vous consulter vous-même.");

        var target = await context.Members
            .Where(m => m.Id == request.TargetMemberId && !m.IsDeleted)
            .Select(m => new { m.Id, m.FirstName, m.LastName })
            .FirstOrDefaultAsync(ct);
        if (target is null)
            return Result<ImpersonateResponse>.Failure("Membre introuvable.");

        // The member's (optional) login account: source of the token's email + sub, and the super-admin guard.
        var targetUser = await context.Users
            .Where(u => u.MemberId == request.TargetMemberId)
            .Select(u => new { u.Id, u.Email, u.IsSuperAdmin })
            .FirstOrDefaultAsync(ct);
        // Never impersonate a super-admin: it would hand a Chef de Groupe a super-admin's read view (privilege
        // escalation) and is pointless for a super-admin.
        if (targetUser?.IsSuperAdmin == true)
            return Result<ImpersonateResponse>.Failure("Impossible de consulter un super-administrateur.");

        // The target's REAL permissions + units (isSuperAdmin: false — an impersonation session is never super-admin).
        var (permissions, unitIds) = await AuthAccess.LoadAsync(context, target.Id, isSuperAdmin: false, ct);

        var token = tokenService.GenerateImpersonationToken(
            targetUser?.Id, target.Id, targetUser?.Email ?? "", permissions, unitIds, currentUser.UserId.Value);

        var memberName = $"{target.FirstName} {target.LastName}".Trim();
        // Audited with the acting admin's identity (this request carries the admin token, not the impersonation
        // token), so the trail reads "Admin X — Voir comme — Member Y".
        await auditService.LogAsync("Impersonate", "Member", target.Id,
            newValues: new { Member = memberName, Mode = "Voir comme (lecture seule)" }, cancellationToken: ct);

        var minutes = 60;
        return Result<ImpersonateResponse>.Success(
            new ImpersonateResponse(token, target.Id, memberName, DateTime.UtcNow.AddMinutes(minutes)));
    }
}
