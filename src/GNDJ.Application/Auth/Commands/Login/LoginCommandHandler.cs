using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.Login;

// Verifies credentials (bcrypt), then loads the user's permissions + authorized units in one query
// (AuthAccess) for the JWT. Both success and failure are audited; the failure message is intentionally
// generic (same text for unknown email vs. wrong password) to avoid user enumeration.
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
        // Normalize the typed email: trim + lowercase, and compare case-insensitively. Mobile keyboards
        // auto-capitalize the first letter and can append a trailing space, so a member typing their
        // synthetic "prenom.nom@scouts.gndj" login would otherwise fail an exact match. Mirrors the
        // applicant login (which already trims + lowercases). Emails are unique, so LOWER() can't ambiguate.
        var email = (request.Email ?? "").Trim().ToLowerInvariant();
        var user = await _context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == email && u.IsActive, cancellationToken);

        // Also treat a missing/deleted member as an auth failure: a soft-deleted member's User is deactivated
        // (so the IsActive filter above already excludes it), but the query filter would also null out Member
        // — guard so we never dereference it below (defensive; avoids a 500 if a user's member is ever gone).
        // ALWAYS run exactly one bcrypt verify (a real one when the account exists, a dummy one when it doesn't)
        // so the response time is identical either way — otherwise skipping the verify for unknown emails leaks
        // which accounts exist via a timing side-channel despite the generic error message.
        var passwordValid = user?.Member is not null
            ? await _passwordHasher.VerifyAsync(request.Password, user.PasswordHash)
            : await _passwordHasher.VerifyDummyAsync(request.Password); // equalize timing, always false

        if (user is null || user.Member is null || !passwordValid)
        {
            await _auditService.LogAsync("LoginFailed", "User", user?.Id,
                newValues: new { Email = request.Email, Reason = user is null ? "Utilisateur introuvable" : user.Member is null ? "Membre supprimé" : "Mot de passe incorrect" },
                cancellationToken: cancellationToken);
            return Result<AuthResponse>.Failure("Adresse courriel ou mot de passe incorrect.");
        }

        // Permissions + authorized units in one round-trip over the member's active assignments.
        var (permissions, unitIds) = await AuthAccess.LoadAsync(_context, user.MemberId, user.IsSuperAdmin, cancellationToken);

        var accessToken = _tokenService.GenerateAccessToken(user, permissions, unitIds);
        var refreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken = _passwordHasher.HashToken(refreshToken);
        user.RefreshTokenExpiry = _tokenService.GetRefreshTokenExpiry(request.RememberMe);
        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = DateTime.UtcNow; // presence signal for the active-sessions view

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Login", "User", user.Id,
            newValues: new { user.Email, MemberId = user.MemberId, Name = $"{user.Member.FirstName} {user.Member.LastName}" },
            cancellationToken: cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, refreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword
        ));
    }
}
