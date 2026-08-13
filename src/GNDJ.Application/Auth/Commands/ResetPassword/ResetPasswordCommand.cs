using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.ResetPassword;

// Completes a "forgot password" flow: sets a new password using the emailed one-time token.
public record ResetPasswordCommand(string Email, string Token, string NewPassword) : IRequest<Result<bool>>;

public class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator(IPasswordPolicy policy)
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).PasswordPolicy(policy);
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

        // Token must match exactly and not have expired (1h window). Same generic message as the
        // unknown-email branch above so neither reveals which check failed.
        if (user.PasswordResetToken != request.Token || user.PasswordResetTokenExpiry < DateTime.UtcNow)
            return Result<bool>.Failure("Lien de réinitialisation invalide ou expiré.");

        // Consume the token and invalidate any existing sessions (refresh token) once the password changes.
        user.PasswordHash = await passwordHasher.HashAsync(request.NewPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        // The user set their own password (self-service reset OR the activation link) — clear the forced-change flag.
        user.MustChangePassword = false;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("PasswordReset", "User", user.Id, newValues: new { user.Email }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
