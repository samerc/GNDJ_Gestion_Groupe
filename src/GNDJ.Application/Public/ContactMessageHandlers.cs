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
    Guid? ClaimedByUserId, string? ClaimedByName, DateTime? ClaimedAt,
    DateTime? ResolvedAt, string? ResolvedByName,
    // Deliverable reply address: the SenderEmail for a normal address, the member's REAL contact email when the
    // sender typed their "@{user_domain}" login username, or null when it's a username with no real email on file
    // (so the dialog can warn instead of pretending it will be delivered).
    string? ReplyToEmail = null,
    // Every reply sent, oldest first (a second reply no longer replaces the first one).
    IReadOnlyList<ContactMessageReplyDto>? Replies = null,
    // Set only in the « Supprimés » view: when the message was deleted (it can be restored from there).
    DateTime? DeletedAt = null);

public record ContactMessageReplyDto(Guid Id, string Subject, string Body, string SentTo, string? RepliedByName, DateTime CreatedAt);

public record ContactMessageListDto(IReadOnlyList<ContactMessageDto> Items, int Total, int UnreadCount, bool HasMore, int OpenCount = 0);

// ── List (paged, unread first then newest) with accent-insensitive search ─────
// Status: "open" (not resolved — the default inbox), "resolved", "deleted" (the bin: soft-deleted messages, restorable),
// anything else = all (not deleted).
public record GetContactMessagesQuery(string? Search = null, bool UnreadOnly = false, int Page = 1, int PageSize = 20, string? Status = null)
    : IRequest<ContactMessageListDto>;

public class GetContactMessagesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetContactMessagesQuery, ContactMessageListDto>
{
    public async ValueTask<ContactMessageListDto> Handle(GetContactMessagesQuery request, CancellationToken ct)
    {
        var page = Math.Max(1, request.Page);
        var size = Math.Clamp(request.PageSize, 1, 100);

        var deletedView = request.Status == "deleted";
        // The bin reads past the soft-delete filter (deleted rows only); every other view keeps the filter.
        var q = deletedView
            ? context.ContactMessages.IgnoreQueryFilters().Where(m => m.IsDeleted)
            : context.ContactMessages.AsQueryable();

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
        var openCount = await context.ContactMessages.CountAsync(m => m.ResolvedAt == null, ct);
        if (request.Status == "open") q = q.Where(m => m.ResolvedAt == null);
        else if (request.Status == "resolved") q = q.Where(m => m.ResolvedAt != null);
        var total = await q.CountAsync(ct);
        if (request.UnreadOnly) q = q.Where(m => !m.IsRead);

        var ordered = deletedView
            ? q.OrderByDescending(m => m.DeletedAt) // most recently deleted first
            : q.OrderBy(m => m.ResolvedAt != null)  // still to handle first
               .ThenBy(m => m.IsRead)               // then unread
               .ThenByDescending(m => m.CreatedAt); // then newest
        var items = await ordered
            .Skip((page - 1) * size).Take(size + 1) // +1 to detect "has more"
            .Select(m => new ContactMessageDto(
                m.Id, m.SenderName, m.SenderEmail, m.Subject, m.Message,
                m.IsRead, m.CreatedAt, m.RepliedAt, m.ReplySubject, m.ReplyBody,
                m.ClaimedByUserId, m.ClaimedByName, m.ClaimedAt,
                m.ResolvedAt, m.ResolvedByName, null, null, m.IsDeleted ? m.DeletedAt : null))
            .ToListAsync(ct);

        var hasMore = items.Count > size;
        if (hasMore) items = items.Take(size).ToList();

        // Resolve each sender's deliverable reply address (a login username -> the member's real email) so the
        // inbox dialog shows/uses the address a reply would actually reach. Batched (one lookup for the page).
        var replyMap = await ContactReplyEmail.ResolveManyAsync(context, items.Select(i => i.SenderEmail), ct);
        // Reply history for the page, one query.
        var ids = items.Select(i => i.Id).ToList();
        var replies = (await context.ContactMessageReplies
                .Where(r => ids.Contains(r.ContactMessageId))
                .OrderBy(r => r.CreatedAt)
                .Select(r => new { r.ContactMessageId, Dto = new ContactMessageReplyDto(r.Id, r.Subject, r.Body, r.SentTo, r.RepliedByName, r.CreatedAt) })
                .ToListAsync(ct))
            .ToLookup(r => r.ContactMessageId, r => r.Dto);

        items = items.Select(i => i with
        {
            ReplyToEmail = replyMap.TryGetValue(i.SenderEmail?.Trim() ?? "", out var to) ? to : i.SenderEmail,
            Replies = replies[i.Id].ToList(),
        }).ToList();

        return new ContactMessageListDto(items, total, unreadCount, hasMore, openCount);
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

public class ReplyContactMessageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, INotificationService notifications, IAuditService audit)
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

        // The sender may have typed their login username (…@scouts.gndj) instead of a real email — resolve it to
        // the member's real contact email so the reply is actually delivered.
        var replyTo = await ContactReplyEmail.ResolveAsync(context, m.SenderEmail, ct);
        if (string.IsNullOrWhiteSpace(replyTo))
            return Result<bool>.Failure(
                "Impossible de répondre par email : l'expéditeur a saisi son identifiant de connexion et aucune " +
                "adresse email réelle n'est enregistrée sur sa fiche. Ajoutez une adresse à sa fiche, puis réessayez.");

        // Queue the reply to the resolved address via the durable outbox (never blocks; survives restart).
        await emailQueue.EnqueueAsync(new EmailJob("adhoc_message", replyTo.Trim(), new Dictionary<string, string>
        {
            ["subject"] = subject,
            ["body"] = body,
        }), ct);

        var replier = currentUser.MemberId is Guid mid
            ? await context.Members.Where(x => x.Id == mid).Select(x => (x.FirstName + " " + x.LastName).Trim()).FirstOrDefaultAsync(ct)
            : null;
        var now = DateTime.UtcNow;

        // Keep every reply (history); the fields on the message itself only hold the latest one.
        // Added through the DbSet with the FK, never through m.Replies (that would issue a spurious parent update).
        context.ContactMessageReplies.Add(new Domain.Entities.ContactMessageReply
        {
            ContactMessageId = m.Id,
            Subject = subject,
            Body = body,
            SentTo = replyTo.Trim(),
            RepliedByUserId = currentUser.UserId,
            RepliedByName = string.IsNullOrWhiteSpace(replier) ? null : replier,
            CreatedAt = now,
        });

        m.RepliedAt = now;
        m.ReplySubject = subject;
        m.ReplyBody = body;
        m.RepliedByUserId = currentUser.UserId;
        m.IsRead = true;
        m.ReadAt ??= DateTime.UtcNow;
        // Answering a message resolves it (unless it already was).
        if (m.ResolvedAt is null)
        {
            m.ResolvedAt = now;
            m.ResolvedByUserId = currentUser.UserId;
            m.ResolvedByName = string.IsNullOrWhiteSpace(replier) ? "Un responsable" : replier;
        }
        await context.SaveChangesAsync(ct);

        // Tell the OTHER managers who answered, so two people don't reply to the same message. Best-effort,
        // after the commit; excludes the replier (they know they replied).
        await notifications.NotifyGroupManagersAsync(NotificationTypes.Info, "Réponse à un message de contact",
            $"{(string.IsNullOrWhiteSpace(replier) ? "Un responsable" : replier)} a répondu à {m.SenderName}",
            "/admin/contact-messages", excludeMemberId: currentUser.MemberId, ct: ct);

        await audit.LogAsync("Reply", "ContactMessage", m.Id, newValues: new { Sender = m.SenderName, Subject = subject }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Resolve / reopen ─────────────────────────────────────────────────────────
// Marks a message as dealt with WITHOUT replying (answered by phone, spam, nothing to do…), or reopens it.
// Resolving also marks it read. Name is denormalized for display.
public record ResolveContactMessageCommand(Guid Id, bool Resolved) : IRequest<Result<bool>>;

public class ResolveContactMessageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ResolveContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ResolveContactMessageCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        if (request.Resolved)
        {
            if (m.ResolvedAt is not null) return Result<bool>.Success(true);
            var name = currentUser.MemberId is Guid mid
                ? await context.Members.Where(x => x.Id == mid).Select(x => (x.FirstName + " " + x.LastName).Trim()).FirstOrDefaultAsync(ct)
                : null;
            m.ResolvedAt = DateTime.UtcNow;
            m.ResolvedByUserId = currentUser.UserId;
            m.ResolvedByName = string.IsNullOrWhiteSpace(name) ? "Un responsable" : name;
            m.IsRead = true;
            m.ReadAt ??= DateTime.UtcNow;
        }
        else
        {
            m.ResolvedAt = null; m.ResolvedByUserId = null; m.ResolvedByName = null;
        }
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(request.Resolved ? "Resolve" : "Reopen", "ContactMessage", m.Id,
            newValues: new { Sender = m.SenderName, m.Subject }, cancellationToken: ct);
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

public class DeleteContactMessageCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<DeleteContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteContactMessageCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        var label = new { Sender = m.SenderName, Subject = m.Subject };
        context.ContactMessages.Remove(m); // soft-delete via interceptor
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Delete", "ContactMessage", request.Id, oldValues: label, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Restore (undo a soft-delete) ──────────────────────────────────────────────
// Powers the "Annuler" affordance on the delete toast. Loads through IgnoreQueryFilters since the row is hidden
// by the soft-delete filter.
public record RestoreContactMessageCommand(Guid Id) : IRequest<Result<bool>>;

public class RestoreContactMessageCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<RestoreContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RestoreContactMessageCommand request, CancellationToken ct)
    {
        var m = await context.ContactMessages.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == request.Id, ct);
        if (m is null) return Result<bool>.Failure("Message introuvable.");
        if (m.IsDeleted)
        {
            m.IsDeleted = false; m.DeletedAt = null; m.DeletedBy = null;
            await context.SaveChangesAsync(ct);
            await audit.LogAsync("Restore", "ContactMessage", m.Id, newValues: new { Expediteur = m.SenderName, Objet = m.Subject }, cancellationToken: ct);
        }
        return Result<bool>.Success(true);
    }
}
