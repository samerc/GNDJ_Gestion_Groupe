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

        // Sign out every OTHER device (their next refresh fails, access dies within 15 min) and hand THIS
        // device a fresh token pair so it stays signed in. Signing this device out too used to drop a forced
        // first-login user ~15 min after setting their password. Mirrors SignOutOtherDevices.
        var (permissions, unitIds) = await AuthAccess.LoadAsync(context, user.MemberId, user.IsSuperAdmin, ct);
        var (sessionId, newRefreshToken) = await UserSessions.KeepThisDeviceOnlyAsync(
            context, tokenService, passwordHasher, currentUser, user.Id, ct);
        var accessToken = tokenService.GenerateAccessToken(user, permissions, unitIds, sessionId);
        user.LastActivityAt = DateTime.UtcNow; // presence signal so the session shows "en ligne"

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("ChangePassword", "User", user.Id, cancellationToken: ct);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, newRefreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword
        ));
    }
}
