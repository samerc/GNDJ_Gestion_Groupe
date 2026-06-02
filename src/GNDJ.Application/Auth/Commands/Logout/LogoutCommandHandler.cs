using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Logout;

public class LogoutCommandHandler : IRequestHandler<LogoutCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _auditService;

    public LogoutCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService)
    {
        _context = context;
        _currentUser = currentUser;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(LogoutCommand request, CancellationToken cancellationToken)
    {
        if (_currentUser.UserId is null)
            return Result<bool>.Failure("Non authentifié.");

        var user = await _context.Users.FindAsync([_currentUser.UserId], cancellationToken);
        if (user is null)
            return Result<bool>.Failure("Utilisateur introuvable.");

        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Logout", "User", user.Id, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
