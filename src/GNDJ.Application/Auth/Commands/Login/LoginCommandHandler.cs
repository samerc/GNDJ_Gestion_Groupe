using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.Login;

public class LoginCommandHandler : IRequestHandler<LoginCommand, Result<AuthResponse>>
{
    private readonly IApplicationDbContext _context;
    private readonly ITokenService _tokenService;
    private readonly IAuditService _auditService;
    private readonly IPasswordHasher _passwordHasher;

    public LoginCommandHandler(IApplicationDbContext context, ITokenService tokenService, IAuditService auditService, IPasswordHasher passwordHasher)
    {
        _context = context;
        _tokenService = tokenService;
        _auditService = auditService;
        _passwordHasher = passwordHasher;
    }

    public async ValueTask<Result<AuthResponse>> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        var user = await _context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, cancellationToken);

        if (user is null || !_passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            await _auditService.LogAsync("LoginFailed", "User", user?.Id,
                newValues: new { Email = request.Email, Reason = user is null ? "Utilisateur introuvable" : "Mot de passe incorrect" },
                cancellationToken: cancellationToken);
            return Result<AuthResponse>.Failure("Adresse courriel ou mot de passe incorrect.");
        }

        // Load permissions from active assignments -> functional roles -> security profiles -> permissions
        var permissions = await LoadUserPermissions(user.Id, user.IsSuperAdmin, cancellationToken);
        var unitIds = await LoadAuthorizedUnitIds(user.Id, user.IsSuperAdmin, cancellationToken);

        var accessToken = _tokenService.GenerateAccessToken(user, permissions, unitIds);
        var refreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken = _passwordHasher.HashToken(refreshToken);
        user.RefreshTokenExpiry = _tokenService.GetRefreshTokenExpiry();
        user.LastLoginAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Login", "User", user.Id,
            newValues: new { user.Email, MemberId = user.MemberId, Name = $"{user.Member.FirstName} {user.Member.LastName}" },
            cancellationToken: cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, refreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions
        ));
    }

    private async Task<List<string>> LoadUserPermissions(Guid userId, bool isSuperAdmin, CancellationToken ct)
    {
        if (isSuperAdmin)
            return [.. Domain.Enums.Permissions.All];

        var user = await _context.Users.FindAsync([userId], ct);
        if (user is null) return [];

        return await _context.MemberAssignments
            .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
            .Select(a => a.FunctionalRole.SecurityProfile)
            .SelectMany(sp => sp.Permissions)
            .Select(p => p.Permission)
            .Distinct()
            .ToListAsync(ct);
    }

    private async Task<List<Guid>> LoadAuthorizedUnitIds(Guid userId, bool isSuperAdmin, CancellationToken ct)
    {
        if (isSuperAdmin)
            return await _context.Units.Select(u => u.Id).ToListAsync(ct);

        var user = await _context.Users.FindAsync([userId], ct);
        if (user is null) return [];

        return await _context.MemberAssignments
            .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
            .Select(a => a.UnitId)
            .Distinct()
            .ToListAsync(ct);
    }
}
