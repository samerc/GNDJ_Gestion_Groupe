using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.MyOnboarding;

// Marks the first-login welcome tour as seen for the CALLER's OWN member (id resolved server-side, never
// supplied). Stamps Member.OnboardingSeenAt so the carousel never shows again — even on another device
// (a server flag, unlike a localStorage one). Idempotent: a second call is a no-op.
public record MarkOnboardingSeenCommand : IRequest<Result<bool>>;

public class MarkOnboardingSeenHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<MarkOnboardingSeenCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(MarkOnboardingSeenCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<bool>.Failure("Aucun membre associé à ce compte.");

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == memberId.Value, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");

        if (member.OnboardingSeenAt is null)
        {
            member.OnboardingSeenAt = DateTime.UtcNow; // a real instant, not a calendar date
            await context.SaveChangesAsync(ct);
        }
        return Result<bool>.Success(true);
    }
}
