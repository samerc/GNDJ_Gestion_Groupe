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

    public RefreshTokenCommandHandler(IApplicationDbContext context, ITokenService tokenService, IPasswordHasher passwordHasher)
    {
        _context = context;
        _tokenService = tokenService;
        _passwordHasher = passwordHasher;
    }

    public async ValueTask<Result<AuthResponse>> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
    {
        // Refresh tokens are stored as deterministic SHA-256 hashes, so we can match directly
        // with an indexed lookup instead of bcrypt-verifying against every user (O(1) vs O(N)).
        var tokenHash = _passwordHasher.HashToken(request.RefreshToken);
        var user = await _context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.RefreshToken == tokenHash && u.RefreshTokenExpiry > DateTime.UtcNow && u.IsActive, cancellationToken);

        if (user is null)
            return Result<AuthResponse>.Failure("Jeton de rafraîchissement invalide ou expiré.");

        // Permissions + authorized units in one round-trip (same as Login).
        var (permissions, unitIds) = await AuthAccess.LoadAsync(_context, user.MemberId, user.IsSuperAdmin, cancellationToken);

        // Rotate tokens
        var accessToken = _tokenService.GenerateAccessToken(user, permissions, unitIds);
        var newRefreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken = _passwordHasher.HashToken(newRefreshToken);
        user.RefreshTokenExpiry = _tokenService.GetRefreshTokenExpiry();

        await _context.SaveChangesAsync(cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, newRefreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions
        ));
    }
}
