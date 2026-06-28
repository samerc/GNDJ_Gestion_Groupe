using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace GNDJ.Application.Auth.Commands.RequestPasswordReset;

// Starts the "forgot password" flow: emails a one-time reset link for the given address.
public record RequestPasswordResetCommand(string Email) : IRequest<Result<bool>>;

public class RequestPasswordResetCommandValidator : AbstractValidator<RequestPasswordResetCommand>
{
    public RequestPasswordResetCommandValidator()
        => RuleFor(x => x.Email).NotEmpty().WithMessage("L'adresse courriel est requise.")
            .EmailAddress().WithMessage("L'adresse courriel est invalide.").MaximumLength(254);
}

public class RequestPasswordResetCommandHandler(
    IApplicationDbContext context,
    IEmailService emailService
) : IRequestHandler<RequestPasswordResetCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RequestPasswordResetCommand request, CancellationToken ct)
    {
        var user = await context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, ct);

        // Always return success to prevent user enumeration
        if (user is null)
            return Result<bool>.Success(true);

        // Generate a secure token
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "").Replace("/", "").Replace("=", "");

        user.PasswordResetToken = token;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);

        await context.SaveChangesAsync(ct);

        // Send email
        try
        {
            var baseUrl = await context.Settings
                .Where(s => s.Key == "app.base_url")
                .Select(s => s.Value)
                .FirstOrDefaultAsync(ct) ?? "http://localhost:5173";
            var resetLink = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(request.Email)}";
            await emailService.SendAsync("password_reset", request.Email, new Dictionary<string, string>
            {
                ["memberName"] = user.Member?.FirstName ?? "Utilisateur",
                ["resetLink"] = resetLink,
                ["expiryHours"] = "1"
            }, ct);
        }
        catch
        {
            // Don't fail the request if email fails — token is still saved
        }

        return Result<bool>.Success(true);
    }
}
