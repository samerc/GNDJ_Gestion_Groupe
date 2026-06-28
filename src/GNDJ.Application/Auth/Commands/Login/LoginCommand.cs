using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Login;

// Member/chef login by email + password. On success returns a JWT access token + a rotating refresh token.
public record LoginCommand(string Email, string Password) : IRequest<Result<AuthResponse>>;
