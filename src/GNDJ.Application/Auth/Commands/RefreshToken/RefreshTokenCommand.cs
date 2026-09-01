using FluentValidation;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.RefreshToken;

// Exchanges a still-valid refresh token for a fresh access token + a rotated refresh token (silent re-auth).
// RememberMe carries the client's "Rester connecté" choice through rotation so the new token keeps the
// long (remembered) vs short (session) expiry.
public record RefreshTokenCommand(string RefreshToken, bool RememberMe = false) : IRequest<Result<AuthResponse>>;

public class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator()
        => RuleFor(x => x.RefreshToken).NotEmpty().WithMessage("Jeton requis.").MaximumLength(500);
}
