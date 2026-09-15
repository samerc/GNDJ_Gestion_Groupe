using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Auth.Commands.ChangePassword;

// Self-service password change for the logged-in user: requires the current password and a different new one.
// Returns a fresh token pair (see the handler) so the CURRENT device stays signed in.
public record ChangePasswordCommand(string CurrentPassword, string NewPassword) : IRequest<Result<AuthResponse>>;

public class ChangePasswordCommandValidator : AbstractValidator<ChangePasswordCommand>
{
    public ChangePasswordCommandValidator(IPasswordPolicy policy)
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage("Le mot de passe actuel est requis.");
        RuleFor(x => x.NewPassword).PasswordPolicy(policy);
        RuleFor(x => x.NewPassword)
            .Must((cmd, newPwd) => newPwd != cmd.CurrentPassword)
            .WithMessage("Le nouveau mot de passe doit être différent de l'actuel.");
    }
}

public class ChangePasswordCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IAuditService auditService
) : IRequestHandler<ChangePasswordCommand, Result<AuthResponse>>
{
    public async ValueTask<Result<AuthResponse>> Handle(ChangePasswordCommand request, CancellationToken ct)
    {
        if (currentUser.UserId is null)
            return Result<AuthResponse>.Failure("Utilisateur non authentifié.");

        var user = await context.Users.FindAsync([currentUser.UserId.Value], ct);
        if (user is null)
            return Result<AuthResponse>.Failure("Utilisateur introuvable.");

        if (!await passwordHasher.VerifyAsync(request.CurrentPassword, user.PasswordHash))
            return Result<AuthResponse>.Failure("Le mot de passe actuel est incorrect.");

        user.PasswordHash = await passwordHasher.HashAsync(request.NewPassword);
        // The user just set their own password — clear any forced-change requirement.
        user.MustChangePassword = false;

        // ROTATE the single refresh token instead of nulling it: a brand-new token orphans every OTHER
        // device (their stored token no longer matches → their next refresh fails, access dies ≤15 min),
        // while THIS device keeps working because we hand it the fresh pair back. Nulling it used to log the
        // CURRENT device out too — silently, ~15 min after a forced first-login user set their password (they
        // set it via this endpoint through the ForcePasswordChange screen) — and dropped them from Sessions
        // actives. Mirrors SignOutOtherDevices.
        var (permissions, unitIds) = await AuthAccess.LoadAsync(context, user.MemberId, user.IsSuperAdmin, ct);
        var accessToken = tokenService.GenerateAccessToken(user, permissions, unitIds);
        var newRefreshToken = tokenService.GenerateRefreshToken();
        user.RefreshToken = passwordHasher.HashToken(newRefreshToken);
        user.RefreshTokenExpiry = tokenService.GetRefreshTokenExpiry();
        user.LastActivityAt = DateTime.UtcNow; // presence signal so the session shows "en ligne"

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("ChangePassword", "User", user.Id, cancellationToken: ct);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, newRefreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword
        ));
    }
}
