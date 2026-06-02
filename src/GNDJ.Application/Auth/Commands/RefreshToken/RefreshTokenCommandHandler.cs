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
        // Find active users with non-expired refresh tokens
        var users = await _context.Users
            .Include(u => u.Member)
            .Where(u => u.RefreshToken != null && u.RefreshTokenExpiry > DateTime.UtcNow && u.IsActive)
            .ToListAsync(cancellationToken);

        // Check each user's hashed refresh token
        var user = users.FirstOrDefault(u => _passwordHasher.Verify(request.RefreshToken, u.RefreshToken!));

        if (user is null)
            return Result<AuthResponse>.Failure("Jeton de rafraîchissement invalide ou expiré.");

        // Load permissions for new token
        var permissions = user.IsSuperAdmin
            ? [.. Domain.Enums.Permissions.All]
            : await _context.MemberAssignments
                .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
                .Select(a => a.FunctionalRole.SecurityProfile)
                .SelectMany(sp => sp.Permissions)
                .Select(p => p.Permission)
                .Distinct()
                .ToListAsync(cancellationToken);

        var unitIds = user.IsSuperAdmin
            ? await _context.Units.Select(u => u.Id).ToListAsync(cancellationToken)
            : await _context.MemberAssignments
                .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
                .Select(a => a.UnitId)
                .Distinct()
                .ToListAsync(cancellationToken);

        // Rotate tokens
        var accessToken = _tokenService.GenerateAccessToken(user, permissions, unitIds);
        var newRefreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken = _passwordHasher.Hash(newRefreshToken);
        user.RefreshTokenExpiry = _tokenService.GetRefreshTokenExpiry();

        await _context.SaveChangesAsync(cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, newRefreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions
        ));
    }
}
