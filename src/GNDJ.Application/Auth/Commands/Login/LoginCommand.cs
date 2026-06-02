using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Login;

public record LoginCommand(string Email, string Password) : IRequest<Result<AuthResponse>>;
