using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.ResetPassword;

public record ResetPasswordCommand(string Email, string Token, string NewPassword) : IRequest<Result<bool>>;

public class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).StrongPassword();
    }
}

public class ResetPasswordCommandHandler(
    IApplicationDbContext context,
    IPasswordHasher passwordHasher,
    IAuditService auditService
) : IRequestHandler<ResetPasswordCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ResetPasswordCommand request, CancellationToken ct)
    {
        var user = await context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, ct);

        if (user is null)
            return Result<bool>.Failure("Lien de réinitialisation invalide ou expiré.");

        if (user.PasswordResetToken != request.Token || user.PasswordResetTokenExpiry < DateTime.UtcNow)
            return Result<bool>.Failure("Lien de réinitialisation invalide ou expiré.");

        user.PasswordHash = passwordHasher.Hash(request.NewPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("PasswordReset", "User", user.Id, newValues: new { user.Email }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
