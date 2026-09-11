using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Notifications;

// In-app notifications for the CURRENT user. Every read/write resolves the recipient from the authenticated
// member id server-side (never a client-supplied id), so a user only ever sees / marks their own — no IDOR
// surface, no permission needed beyond being logged in.
public record NotificationDto(Guid Id, string Type, string Title, string? Body, string? LinkUrl, bool IsRead, DateTime CreatedAt);

public record NotificationListDto(IReadOnlyList<NotificationDto> Items, int UnreadCount, bool HasMore);

// ── List (paged, newest first) ───────────────────────────────────────────────
public record GetNotificationsQuery(int Page = 1, int PageSize = 20, bool UnreadOnly = false) : IRequest<NotificationListDto>;

public class GetNotificationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetNotificationsQuery, NotificationListDto>
{
    public async ValueTask<NotificationListDto> Handle(GetNotificationsQuery request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return new NotificationListDto([], 0, false);

        var page = Math.Max(1, request.Page);
        var size = Math.Clamp(request.PageSize, 1, 100);

        var mine = context.Notifications.Where(n => n.MemberId == memberId);
        var unreadCount = await mine.CountAsync(n => !n.IsRead, ct);

        var filtered = request.UnreadOnly ? mine.Where(n => !n.IsRead) : mine;
        var items = await filtered
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * size).Take(size + 1) // +1 to detect "has more" without a second count
            .Select(n => new NotificationDto(n.Id, n.Type, n.Title, n.Body, n.LinkUrl, n.IsRead, n.CreatedAt))
            .ToListAsync(ct);

        var hasMore = items.Count > size;
        if (hasMore) items = items.Take(size).ToList();
        return new NotificationListDto(items, unreadCount, hasMore);
    }
}

// ── Unread count (bell badge) ────────────────────────────────────────────────
public record GetUnreadNotificationCountQuery : IRequest<int>;

public class GetUnreadNotificationCountQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnreadNotificationCountQuery, int>
{
    public async ValueTask<int> Handle(GetUnreadNotificationCountQuery request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return 0;
        return await context.Notifications.CountAsync(n => n.MemberId == memberId && !n.IsRead, ct);
    }
}

// ── Mark one read ────────────────────────────────────────────────────────────
public record MarkNotificationReadCommand(Guid Id) : IRequest<Result<bool>>;

public class MarkNotificationReadCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<MarkNotificationReadCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(MarkNotificationReadCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<bool>.Failure("Non authentifié.");
        // Scoped to the caller's own member id — a foreign id simply matches nothing (no leak, no 403 needed).
        var n = await context.Notifications.FirstOrDefaultAsync(x => x.Id == request.Id && x.MemberId == memberId, ct);
        if (n is null) return Result<bool>.Success(true); // idempotent
        if (!n.IsRead) { n.IsRead = true; n.ReadAt = DateTime.UtcNow; await context.SaveChangesAsync(ct); }
        return Result<bool>.Success(true);
    }
}

// ── Mark all read ────────────────────────────────────────────────────────────
public record MarkAllNotificationsReadCommand : IRequest<Result<int>>;

public class MarkAllNotificationsReadCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<MarkAllNotificationsReadCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(MarkAllNotificationsReadCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<int>.Success(0);
        var now = DateTime.UtcNow;
        var updated = await context.Notifications
            .Where(n => n.MemberId == memberId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true).SetProperty(n => n.ReadAt, now), ct);
        return Result<int>.Success(updated);
    }
}
