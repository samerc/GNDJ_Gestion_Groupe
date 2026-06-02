using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Logout;

public record LogoutCommand : IRequest<Result<bool>>;
