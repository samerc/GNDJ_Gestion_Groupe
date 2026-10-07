using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Members;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.SwitchSibling;

// « Changer de compte » without a password: the signed-in member opens a new session on a CONFIRMED sibling's
// account when FamilyAccess allows it (same main contact email, no maîtrise / protected account on either side).
// Otherwise the client falls back to the password dialog. The current session stays signed in (the client keeps
// it in its account pool). Same maintenance gate as the login; audited as a Login with Method = "Changement de compte".
public record SwitchToSiblingCommand(Guid MemberId) : IRequest<Result<AuthResponse>>;

public class SwitchToSiblingCommandHandler(
    IApplicationDbContext context,
    ITokenService tokenService,
    IPasswordHasher passwordHasher,
    IAuditService audit,
    IMaintenanceProvider maintenance,
    ICurrentUserService currentUser
) : IRequestHandler<SwitchToSiblingCommand, Result<AuthResponse>>
{
    public async ValueTask<Result<AuthResponse>> Handle(SwitchToSiblingCommand request, CancellationToken ct)
    {
        const string denied = "Ce compte demande son mot de passe.";
        // A real device session only (an impersonation token has none — and is read-only anyway).
        if (currentUser.SessionId is null || currentUser.MemberId is not Guid memberId || request.MemberId == memberId)
            return Result<AuthResponse>.Failure(denied);

        var family = await FamilyAccess.LoadAsync(context, memberId, ct);
        var me = family.FirstOrDefault(f => f.MemberId == memberId);
        var target = family.FirstOrDefault(f => f.MemberId == request.MemberId);
        if (me is null || target?.UserId is null || !FamilyAccess.CanSwitchWithoutPassword(me, target))
            return Result<AuthResponse>.Failure(denied);

        var user = await context.Users.Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Id == target.UserId && u.IsActive, ct);
        if (user?.Member is null) return Result<AuthResponse>.Failure(denied);

        var maint = await maintenance.GetAsync(ct);
        if (maint.Site || maint.Membres)
            return Result<AuthResponse>.Failure(string.IsNullOrWhiteSpace(maint.Message)
                ? "Le site est en maintenance. Merci de réessayer plus tard." : maint.Message);

        // Keep the same « Rester connecté » choice as the session the parent is using now.
        var rememberMe = currentUser.SessionId is Guid sid
            && await context.UserSessions.Where(s => s.Id == sid).Select(s => s.RememberMe).FirstOrDefaultAsync(ct);

        var (permissions, unitIds) = await AuthAccess.LoadAsync(context, user.MemberId, user.IsSuperAdmin, ct);
        var (sessionId, refreshToken) = await UserSessions.StartAsync(
            context, tokenService, passwordHasher, currentUser, user.Id, rememberMe, ct);
        var accessToken = tokenService.GenerateAccessToken(user, permissions, unitIds, sessionId);
        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        await audit.LogAsync("Login", "User", user.Id, newValues: new
        {
            user.Email, MemberId = user.MemberId, Name = $"{user.Member.FirstName} {user.Member.LastName}",
            Method = "Changement de compte", From = $"{me.FirstName} {me.LastName}", Portal = "Espace membres",
        }, cancellationToken: ct);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, refreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword));
    }
}
