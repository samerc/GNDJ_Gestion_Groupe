using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Logout;

// Invalidates the current session by nulling the stored refresh token so it can no longer be rotated.
// The access token stays valid until it expires (~15 min) — there's no server-side access-token revocation.
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
        await _auditService.LogAsync("Logout", "User", user.Id,
            newValues: new { user.Email },
            cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
