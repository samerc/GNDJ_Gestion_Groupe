using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Public;

// In-app inbox for public contact-form submissions. Managers (content.manage — super-admin / assoc-admin /
// CG / ACG) list, read, reply, and delete messages here instead of digging through email. Gated at the
// controller with content.manage; every handler is manager-only by that route policy.
public record ContactMessageDto(
    Guid Id, string SenderName, string SenderEmail, string Subject, string Message,
    bool IsRead, DateTime CreatedAt, DateTime? RepliedAt, string? ReplySubject, string? ReplyBody,
    Guid? ClaimedByUserId, string? ClaimedByName, DateTime? ClaimedAt);

public record ContactMessageListDto(IReadOnlyList<ContactMessageDto> Items, int Total, int UnreadCount, bool HasMore);

// ── List (paged, unread first then newest) with accent-insensitive search ─────
public record GetContactMessagesQuery(string? Search = null, bool UnreadOnly = false, int Page = 1, int PageSize = 20)
    : IRequest<ContactMessageListDto>;

public class GetContactMessagesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetContactMessagesQuery, ContactMessageListDto>
{
    public async ValueTask<ContactMessageListDto> Handle(GetContactMessagesQuery request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var size = Math.Clamp(request.PageSize, 1, 100);

        var q = context.ContactMessages.AsQueryable();

        // Accent- + case-insensitive search across sender name/email/subject/message (same helper as member/audit
        // search). `s` stays a plain lowercased C# string; DbFns.Unaccent is applied INSIDE the expression on both
        // sides so it translates to SQL f_unaccent (calling it in C# would throw the DB-only stub).
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(m =>
                DbFns.Unaccent(m.SenderName.ToLower()).Contains(DbFns.Unaccent(s)) ||
                DbFns.Unaccent(m.SenderEmail.ToLower()).Contains(DbFns.Unaccent(s)) ||
                DbFns.Unaccent(m.Subject.ToLower()).Contains(DbFns.Unaccent(s)) ||
                DbFns.Unaccent(m.Message.ToLower()).Contains(DbFns.Unaccent(s)));
        }

        var unreadCount = await context.ContactMessages.CountAsync(m => !m.IsRead, ct);
        var total = await q.CountAsync(ct);
        if (request.UnreadOnly) q = q.Where(m => !m.IsRead);

        var items = await q
            .OrderBy(m => m.IsRead)                 // unread first
            .ThenByDescending(m => m.CreatedAt)     // then newest
            .Skip((page - 1) * size).Take(size + 1) // +1 to detect "has more"
            .Select(m => new ContactMessageDto(
                m.Id, m.SenderName, m.SenderEmail, m.Subject, m.Message,
                m.IsRead, m.CreatedAt, m.RepliedAt, m.ReplySubject, m.ReplyBody,
                m.ClaimedByUserId, m.ClaimedByName, m.ClaimedAt))
            .ToListAsync(ct);

        var hasMore = items.Count > size;
        if (hasMore) items = items.Take(size).ToList();
        return new ContactMessageListDto(items, total, unreadCount, hasMore);
    }
}

// ── Unread count (sidebar badge) ──────────────────────────────────────────────
public record GetUnreadContactMessageCountQuery : IRequest<int>;

public class GetUnreadContactMessageCountQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetUnreadContactMessageCountQuery, int>
{
    public async ValueTask<int> Handle(GetUnreadContactMessageCountQuery request, CancellationToken ct)
        => await context.ContactMessages.CountAsync(m => !m.IsRead, ct);
}

// ── Mark read / unread ────────────────────────────────────────────────────────
public record MarkContactMessageReadCommand(Guid Id, bool Read) : IRequest<Result<bool>>;

public class MarkContactMessageReadCommandHandler(IApplicationDbContext context)
    : IRequestHandler<MarkContactMessageReadCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(MarkContactMessageReadCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        if (m.IsRead != request.Read)
        {
            m.IsRead = request.Read;
            m.ReadAt = request.Read ? DateTime.UtcNow : null;
            await context.SaveChangesAsync(ct);
        }
        return Result<bool>.Success(true);
    }
}

// ── Reply — queue a "Re:" email to the sender + record the reply ───────────────
// Routed through the seeded "adhoc_message" template (subject + free-text body), so the manager types the whole
// answer. Marks the message read + stamps the reply so the inbox shows "Répondu".
public record ReplyContactMessageCommand(Guid Id, string Subject, string Body) : IRequest<Result<bool>>;

public class ReplyContactMessageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, INotificationService notifications)
    : IRequestHandler<ReplyContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReplyContactMessageCommand request, CancellationToken ct)
    {
        var subject = request.Subject?.Trim() ?? "";
        var body = request.Body?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(subject)) return Result<bool>.Failure("L'objet de la réponse est requis.");
        if (string.IsNullOrWhiteSpace(body)) return Result<bool>.Failure("Le message de réponse est requis.");
        if (subject.Length > 200) return Result<bool>.Failure("L'objet est trop long (max 200).");
        if (subject.Contains('<') || subject.Contains('>')) return Result<bool>.Failure("L'objet contient des caractères invalides.");
        if (body.Length > 10000) return Result<bool>.Failure("La réponse est trop longue.");

        var m = await context.ContactMessages.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        if (string.IsNullOrWhiteSpace(m.SenderEmail)) return Result<bool>.Failure("Ce message n'a pas d'adresse de réponse.");

        // Queue the reply to the sender's address via the durable outbox (never blocks; survives restart).
        await emailQueue.EnqueueAsync(new EmailJob("adhoc_message", m.SenderEmail.Trim(), new Dictionary<string, string>
        {
            ["subject"] = subject,
            ["body"] = body,
        }), ct);

        m.RepliedAt = DateTime.UtcNow;
        m.ReplySubject = subject;
        m.ReplyBody = body;
        m.RepliedByUserId = currentUser.UserId;
        m.IsRead = true;
        m.ReadAt ??= DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        // Tell the OTHER managers who answered, so two people don't reply to the same message. Best-effort,
        // after the commit; excludes the replier (they know they replied).
        var replier = currentUser.MemberId is Guid mid
            ? await context.Members.Where(x => x.Id == mid).Select(x => (x.FirstName + " " + x.LastName).Trim()).FirstOrDefaultAsync(ct)
            : null;
        await notifications.NotifyGroupManagersAsync(NotificationTypes.Info, "Réponse à un message de contact",
            $"{(string.IsNullOrWhiteSpace(replier) ? "Un responsable" : replier)} a répondu à {m.SenderName}",
            "/admin/contact-messages", excludeMemberId: currentUser.MemberId, ct: ct);

        return Result<bool>.Success(true);
    }
}

// ── Claim / release ("En cours de traitement par X") ──────────────────────────
// A manager takes ownership so others see it's handled (and don't also reply). Claiming reassigns to the caller;
// releasing clears it. Name is denormalized for display.
public record ClaimContactMessageCommand(Guid Id, bool Claim) : IRequest<Result<bool>>;

public class ClaimContactMessageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<ClaimContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ClaimContactMessageCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        if (request.Claim)
        {
            var name = currentUser.MemberId is Guid mid
                ? await context.Members.Where(x => x.Id == mid).Select(x => (x.FirstName + " " + x.LastName).Trim()).FirstOrDefaultAsync(ct)
                : null;
            m.ClaimedByUserId = currentUser.UserId;
            m.ClaimedByName = string.IsNullOrWhiteSpace(name) ? "Un responsable" : name;
            m.ClaimedAt = DateTime.UtcNow;
        }
        else
        {
            m.ClaimedByUserId = null; m.ClaimedByName = null; m.ClaimedAt = null;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────
public record DeleteContactMessageCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteContactMessageCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteContactMessageCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        context.ContactMessages.Remove(m); // soft-delete via interceptor
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Restore (undo a soft-delete) ──────────────────────────────────────────────
// Powers the "Annuler" affordance on the delete toast. Loads through IgnoreQueryFilters since the row is hidden
// by the soft-delete filter.
public record RestoreContactMessageCommand(Guid Id) : IRequest<Result<bool>>;

public class RestoreContactMessageCommandHandler(IApplicationDbContext context)
    : IRequestHandler<RestoreContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RestoreContactMessageCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        if (m.IsDeleted) { m.IsDeleted = false; m.DeletedAt = null; m.DeletedBy = null; await context.SaveChangesAsync(ct); }
        return Result<bool>.Success(true);
    }
}
