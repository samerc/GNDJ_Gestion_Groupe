using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.MyAppInstalled;

// Records that the CALLER's OWN member runs the app as an installed PWA (id resolved server-side, never supplied).
// Called by the frontend on a standalone launch or the browser's `appinstalled` event. Stamps
// Member.AppInstalledAt the FIRST time only (idempotent) so the CG can see "app installée le …" per member.
// Best-effort tracking — browsers give no reliable installed/not-installed registry (see lib/pwa.ts).
public record MarkAppInstalledCommand : IRequest<Result<bool>>;

public class MarkAppInstalledHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<MarkAppInstalledCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(MarkAppInstalledCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<bool>.Failure("Aucun membre associé à ce compte.");

        // One UPDATE that only touches a member not flagged yet (no row load; a repeat call changes nothing).
        // AppInstalledAt is a real instant, not a calendar date.
        await context.Members.Where(m => m.Id == memberId.Value && m.AppInstalledAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.AppInstalledAt, DateTime.UtcNow), ct);
        return Result<bool>.Success(true);
    }
}
