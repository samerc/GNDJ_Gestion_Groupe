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

        var muted = await NotificationPrefs.MutedTypesAsync(context, memberId, ct);
        var mine = context.Notifications.Where(n => n.MemberId == memberId);
        if (muted.Count > 0) mine = mine.Where(n => !muted.Contains(n.Type)); // hide muted categories
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
        var muted = await NotificationPrefs.MutedTypesAsync(context, memberId, ct);
        var q = context.Notifications.Where(n => n.MemberId == memberId && !n.IsRead);
        if (muted.Count > 0) q = q.Where(n => !muted.Contains(n.Type));
        return await q.CountAsync(ct);
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

// ── Delete one ───────────────────────────────────────────────────────────────
// Notification is NOT a BaseEntity (no soft-delete) so this is a hard delete. Scoped to the caller's member id,
// so a foreign id simply matches nothing (idempotent, no IDOR).
public record DeleteNotificationCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteNotificationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<DeleteNotificationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteNotificationCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<bool>.Failure("Non authentifié.");
        var n = await context.Notifications.FirstOrDefaultAsync(x => x.Id == request.Id && x.MemberId == memberId, ct);
        if (n is null) return Result<bool>.Success(true); // idempotent
        context.Notifications.Remove(n);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Clear read (tidy up) ──────────────────────────────────────────────────────
// Deletes all of the caller's READ notifications (the natural pairing with "mark all read").
public record ClearReadNotificationsCommand : IRequest<Result<int>>;

public class ClearReadNotificationsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<ClearReadNotificationsCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(ClearReadNotificationsCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<int>.Success(0);
        var deleted = await context.Notifications
            .Where(n => n.MemberId == memberId && n.IsRead)
            .ExecuteDeleteAsync(ct);
        return Result<int>.Success(deleted);
    }
}

// ── Preferences (mute categories) ─────────────────────────────────────────────
// The muted set is a JSON array of notification-type strings on the member (Member.NotificationMutesJson).
public static class NotificationPrefs
{
    // Load the caller's muted notification types (empty when none / unparseable).
    public static async Task<List<string>> MutedTypesAsync(IApplicationDbContext context, Guid memberId, CancellationToken ct)
    {
        var json = await context.Members.Where(m => m.Id == memberId).Select(m => m.NotificationMutesJson).FirstOrDefaultAsync(ct);
        return Parse(json);
    }

    public static List<string> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var arr = System.Text.Json.JsonSerializer.Deserialize<List<string>>(json);
            return arr?.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct().ToList() ?? [];
        }
        catch { return []; }
    }
}

// The known notification categories the UI lets a member mute. Keep in sync with NotificationTypes.
public record NotificationPreferencesDto(IReadOnlyList<string> MutedTypes);

public record GetNotificationPreferencesQuery : IRequest<NotificationPreferencesDto>;

public class GetNotificationPreferencesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetNotificationPreferencesQuery, NotificationPreferencesDto>
{
    public async ValueTask<NotificationPreferencesDto> Handle(GetNotificationPreferencesQuery request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return new NotificationPreferencesDto([]);
        return new NotificationPreferencesDto(await NotificationPrefs.MutedTypesAsync(context, memberId, ct));
    }
}

public record UpdateNotificationPreferencesCommand(IReadOnlyList<string> MutedTypes) : IRequest<Result<bool>>;

public class UpdateNotificationPreferencesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UpdateNotificationPreferencesCommand, Result<bool>>
{
    // Only the known categories are storable, so a stale/garbage value can't slip in.
    private static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        NotificationTypes.Document, NotificationTypes.ChangeRequest, NotificationTypes.Demande,
        NotificationTypes.Hold, NotificationTypes.Info,
    };

    public async ValueTask<Result<bool>> Handle(UpdateNotificationPreferencesCommand request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<bool>.Failure("Non authentifié.");
        var muted = (request.MutedTypes ?? []).Where(t => Allowed.Contains(t)).Distinct().ToList();
        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");
        member.NotificationMutesJson = muted.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(muted);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
