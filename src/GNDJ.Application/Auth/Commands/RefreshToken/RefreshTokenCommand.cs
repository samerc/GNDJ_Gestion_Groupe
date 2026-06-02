using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.RefreshToken;

public record RefreshTokenCommand(string RefreshToken) : IRequest<Result<AuthResponse>>;
