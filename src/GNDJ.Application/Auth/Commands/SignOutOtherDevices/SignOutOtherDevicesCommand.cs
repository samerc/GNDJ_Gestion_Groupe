using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.SignOutOtherDevices;

// "Déconnecter les autres appareils" — for a lost/shared/public device.
// We store a SINGLE refresh token per user, so rotating it (issuing a brand-new one) instantly orphans
// every OTHER device: their stored token no longer matches, so their next refresh fails and their access
// token dies within ~15 min. THIS device stays signed in because we hand it the fresh token pair back
// (same shape as login/refresh). No password change required — the deliberate button is the point.
public record SignOutOtherDevicesCommand() : IRequest<Result<AuthResponse>>;

public class SignOutOtherDevicesCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    ITokenService tokenService,
    IPasswordHasher passwordHasher,
    IAuditService auditService
) : IRequestHandler<SignOutOtherDevicesCommand, Result<AuthResponse>>
{
    public async ValueTask<Result<AuthResponse>> Handle(SignOutOtherDevicesCommand request, CancellationToken ct)
    {
        if (currentUser.UserId is null)
            return Result<AuthResponse>.Failure("Utilisateur non authentifié.");

        var user = await context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Id == currentUser.UserId && u.IsActive, ct);
        if (user is null || user.Member is null)
            return Result<AuthResponse>.Failure("Utilisateur introuvable.");

        // Fresh permissions + authorized units for the re-issued access token (same as Login/Refresh).
        var (permissions, unitIds) = await AuthAccess.LoadAsync(context, user.MemberId, user.IsSuperAdmin, ct);

        // Rotate: the new refresh token overwrites the single stored hash → all other devices are orphaned.
        var accessToken = tokenService.GenerateAccessToken(user, permissions, unitIds);
        var newRefreshToken = tokenService.GenerateRefreshToken();
        user.RefreshToken = passwordHasher.HashToken(newRefreshToken);
        user.RefreshTokenExpiry = tokenService.GetRefreshTokenExpiry();

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("SignOutOtherDevices", "User", user.Id, cancellationToken: ct);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, newRefreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword
        ));
    }
}
