using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.RefreshToken;

public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, Result<AuthResponse>>
{
    private readonly IApplicationDbContext _context;
    private readonly ITokenService _tokenService;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IMaintenanceProvider _maintenance;
    private readonly ICurrentUserService _device;

    public RefreshTokenCommandHandler(IApplicationDbContext context, ITokenService tokenService, IPasswordHasher passwordHasher, IMaintenanceProvider maintenance, ICurrentUserService device)
    {
        _context = context;
        _tokenService = tokenService;
        _passwordHasher = passwordHasher;
        _maintenance = maintenance;
        _device = device;
    }

    public async ValueTask<Result<AuthResponse>> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
    {
        // Each device has its own session; tokens are stored as SHA-256 hashes, so this is an indexed lookup.
        var session = await UserSessions.FindByTokenAsync(_context, _passwordHasher, request.RefreshToken, cancellationToken);
        var user = session?.User;

        if (session is null || user is null || !user.IsActive || user.Member is null)
            return Result<AuthResponse>.Failure("Jeton de rafraîchissement invalide ou expiré.");

        // Maintenance gate: a non-super-admin's open session cannot refresh while the site/members app is in
        // maintenance, so it lapses once the ≤15-min access token expires (they can't keep working through a
        // maintenance window). Super-admins keep refreshing so they can recover the site.
        if (!user.IsSuperAdmin)
        {
            var maint = await _maintenance.GetAsync(cancellationToken);
            if (maint.Site || maint.Membres)
                return Result<AuthResponse>.Failure(string.IsNullOrWhiteSpace(maint.Message)
                    ? "Le site est en maintenance. Merci de réessayer plus tard."
                    : maint.Message);
        }

        // Permissions + authorized units in one round-trip (same as Login).
        var (permissions, unitIds) = await AuthAccess.LoadAsync(_context, user.MemberId, user.IsSuperAdmin, cancellationToken);

        // Rotate this device's token (sliding expiry); the other devices are untouched.
        var newRefreshToken = UserSessions.Rotate(session, _tokenService, _passwordHasher, _device, request.RememberMe);
        var accessToken = _tokenService.GenerateAccessToken(user, permissions, unitIds, session.Id);
        user.LastActivityAt = DateTime.UtcNow; // ~15-min heartbeat while the user is active

        await _context.SaveChangesAsync(cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, newRefreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword
        ));
    }
}
