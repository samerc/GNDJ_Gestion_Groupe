using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Logout;

// Logs out the current user by clearing their stored refresh token (no body — identity comes from the JWT).
public record LogoutCommand : IRequest<Result<bool>>;
