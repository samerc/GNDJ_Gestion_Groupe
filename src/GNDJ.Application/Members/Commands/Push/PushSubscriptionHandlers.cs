using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.Push;

// Self-service Web Push (notification) subscription management for the CALLER's OWN member (id resolved
// server-side). A subscription = one device/browser. Endpoint is globally unique (per browser+origin), so
// subscribing upserts by endpoint: it re-owns the browser for whoever enabled it last (shared device).

public record SubscribePushCommand(string Endpoint, string P256dh, string Auth, string? UserAgent) : IRequest<Result<bool>>;
public record UnsubscribePushCommand(string Endpoint) : IRequest<Result<bool>>;

public class SubscribePushValidator : AbstractValidator<SubscribePushCommand>
{
    public SubscribePushValidator()
    {
        RuleFor(x => x.Endpoint).NotEmpty().MaximumLength(2000).NoHtml();
        RuleFor(x => x.P256dh).NotEmpty().MaximumLength(300).NoHtml();
        RuleFor(x => x.Auth).NotEmpty().MaximumLength(200).NoHtml();
        RuleFor(x => x.UserAgent).MaximumLength(400).NoHtml();
    }
}

public class SubscribePushHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SubscribePushCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SubscribePushCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<bool>.Failure("Aucun membre associé à ce compte.");

        var now = DateTime.UtcNow;
        var existing = await context.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == request.Endpoint, ct);
        if (existing is null)
        {
            context.PushSubscriptions.Add(new PushSubscription
            {
                MemberId = memberId.Value,
                Endpoint = request.Endpoint,
                P256dh = request.P256dh,
                Auth = request.Auth,
                UserAgent = request.UserAgent,
                CreatedAt = now,
                LastSeenAt = now,
            });
        }
        else
        {
            // Same browser re-subscribing (or a different member on this device) → re-own + refresh keys.
            existing.MemberId = memberId.Value;
            existing.P256dh = request.P256dh;
            existing.Auth = request.Auth;
            existing.UserAgent = request.UserAgent;
            existing.LastSeenAt = now;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public class UnsubscribePushHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UnsubscribePushCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UnsubscribePushCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<bool>.Failure("Aucun membre associé à ce compte.");
        // Delete this device's subscription (scoped to the caller so one member can't remove another's).
        await context.PushSubscriptions
            .Where(s => s.Endpoint == request.Endpoint && s.MemberId == memberId.Value)
            .ExecuteDeleteAsync(ct);
        return Result<bool>.Success(true);
    }
}
