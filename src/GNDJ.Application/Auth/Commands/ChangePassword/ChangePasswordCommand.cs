using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Auth.Commands.ChangePassword;

public record ChangePasswordCommand(string CurrentPassword, string NewPassword) : IRequest<Result<bool>>;

public class ChangePasswordCommandValidator : AbstractValidator<ChangePasswordCommand>
{
    public ChangePasswordCommandValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage("Le mot de passe actuel est requis.");
        RuleFor(x => x.NewPassword).StrongPassword()
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

        if (!passwordHasher.Verify(request.CurrentPassword, user.PasswordHash))
            return Result<bool>.Failure("Le mot de passe actuel est incorrect.");

        user.PasswordHash = passwordHasher.Hash(request.NewPassword);
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("ChangePassword", "User", user.Id, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
