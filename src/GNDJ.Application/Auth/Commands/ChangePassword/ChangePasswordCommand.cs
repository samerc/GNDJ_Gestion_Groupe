using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Auth.Commands.ChangePassword;

// Self-service password change for the logged-in user: requires the current password and a different new one.
public record ChangePasswordCommand(string CurrentPassword, string NewPassword) : IRequest<Result<bool>>;

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
    IAuditService auditService
) : IRequestHandler<ChangePasswordCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ChangePasswordCommand request, CancellationToken ct)
    {
        if (currentUser.UserId is null)
            return Result<bool>.Failure("Utilisateur non authentifié.");

        var user = await context.Users.FindAsync([currentUser.UserId.Value], ct);
        if (user is null)
            return Result<bool>.Failure("Utilisateur introuvable.");

        if (!await passwordHasher.VerifyAsync(request.CurrentPassword, user.PasswordHash))
            return Result<bool>.Failure("Le mot de passe actuel est incorrect.");

        // Changing the password invalidates other sessions by clearing the refresh token.
        user.PasswordHash = await passwordHasher.HashAsync(request.NewPassword);
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        // The user just set their own password — clear any forced-change requirement.
        user.MustChangePassword = false;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("ChangePassword", "User", user.Id, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
