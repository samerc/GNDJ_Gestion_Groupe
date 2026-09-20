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

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == memberId.Value, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");

        if (member.AppInstalledAt is null)
        {
            member.AppInstalledAt = DateTime.UtcNow; // a real instant, not a calendar date
            await context.SaveChangesAsync(ct);
        }
        return Result<bool>.Success(true);
    }
}
