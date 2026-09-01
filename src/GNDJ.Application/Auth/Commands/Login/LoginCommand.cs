using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Login;

// Member/chef login by email + password. On success returns a JWT access token + a rotating refresh token.
// RememberMe ("Rester connecté") → a long-lived refresh token (~30 days) instead of the short session window.
public record LoginCommand(string Email, string Password, bool RememberMe = false) : IRequest<Result<AuthResponse>>;
