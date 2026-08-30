using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Email;

// Admin "Emails — file d'attente / échecs": read + operate on the durable email outbox (email_outbox).
// The outbox sender only LOGS a Warning when a mail gives up (Failed), so without this there is no in-app way
// to see that delivery is broken (e.g. SMTP misconfigured at go-live: every reset/access/broadcast reports
// "envoyé" = QUEUED, while the rows silently pile up Failed). These handlers surface that + let an admin requeue.
// Gated in the controller by associations.manage (email infrastructure), same as SMTP servers/templates.
// NOTE: the payload (PayloadJson) is deliberately NOT exposed — it holds the template variables, which for a
// password-reset include the temporary password in clear text.

public record OutboxEmailDto(
    Guid Id, string TemplateCode, string ToEmail, string Status, int Attempts,
    string? LastError, DateTime CreatedAt, DateTime? SentAt, DateTime NextAttemptAt);

// Overall counts (independent of the current filter) so the cards always show the true state of the queue.
public record OutboxSummaryDto(int Pending, int Failed, int Sent);

public record OutboxListDto(IReadOnlyList<OutboxEmailDto> Items, int Total, int Page, int PageSize, OutboxSummaryDto Summary);

// ── List (filter by status + search recipient/template) ──────────────────────
public record GetOutboxEmailsQuery(string? Status, string? Search, int Page, int PageSize) : IRequest<OutboxListDto>;

public class GetOutboxEmailsHandler(IApplicationDbContext context) : IRequestHandler<GetOutboxEmailsQuery, OutboxListDto>
{
    public async ValueTask<OutboxListDto> Handle(GetOutboxEmailsQuery request, CancellationToken ct)
    {
        var page = request.Page < 1 ? 1 : request.Page;
        var pageSize = request.PageSize is < 1 or > 200 ? 50 : request.PageSize;

        IQueryable<OutboxEmail> query = context.OutboxEmails;
        if (TryParseStatus(request.Status, out var status))
            query = query.Where(e => e.Status == status);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            query = query.Where(e => e.ToEmail.ToLower().Contains(term) || e.TemplateCode.ToLower().Contains(term));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new OutboxEmailDto(e.Id, e.TemplateCode, e.ToEmail, e.Status.ToString(), e.Attempts,
                e.LastError, e.CreatedAt, e.SentAt, e.NextAttemptAt))
            .ToListAsync(ct);

        // Whole-table counts for the summary cards (not filtered).
        var summary = new OutboxSummaryDto(
            await context.OutboxEmails.CountAsync(e => e.Status == OutboxEmailStatus.Pending, ct),
            await context.OutboxEmails.CountAsync(e => e.Status == OutboxEmailStatus.Failed, ct),
            await context.OutboxEmails.CountAsync(e => e.Status == OutboxEmailStatus.Sent, ct));

        return new OutboxListDto(items, total, page, pageSize, summary);
    }

    private static bool TryParseStatus(string? s, out OutboxEmailStatus status)
    {
        switch (s?.Trim().ToLowerInvariant())
        {
            case "pending": status = OutboxEmailStatus.Pending; return true;
            case "sent": status = OutboxEmailStatus.Sent; return true;
            case "failed": status = OutboxEmailStatus.Failed; return true;
            default: status = default; return false; // null / "all" / unknown → no status filter
        }
    }
}

// ── Retry one row (requeue) ──────────────────────────────────────────────────
public record RetryOutboxEmailCommand(Guid Id) : IRequest<Result<bool>>;

public class RetryOutboxEmailHandler(IApplicationDbContext context) : IRequestHandler<RetryOutboxEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RetryOutboxEmailCommand request, CancellationToken ct)
    {
        var row = await context.OutboxEmails.FirstOrDefaultAsync(e => e.Id == request.Id, ct);
        if (row is null) return Result<bool>.Failure("Email introuvable.");
        if (row.Status == OutboxEmailStatus.Sent) return Result<bool>.Failure("Cet email a déjà été envoyé.");

        // Requeue: fresh attempt budget, due now. The background sender polls every ~15s (no wake signal is
        // needed — losing latency, not correctness), so it will pick this up shortly.
        row.Status = OutboxEmailStatus.Pending;
        row.Attempts = 0;
        row.LastError = null;
        row.NextAttemptAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Retry ALL failed rows ────────────────────────────────────────────────────
public record RetryFailedOutboxEmailsCommand : IRequest<Result<int>>;

public class RetryFailedOutboxEmailsHandler(IApplicationDbContext context) : IRequestHandler<RetryFailedOutboxEmailsCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(RetryFailedOutboxEmailsCommand request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        // Bulk requeue every Failed row (set-based; these rows aren't tracked). Due immediately, full budget.
        var count = await context.OutboxEmails
            .Where(e => e.Status == OutboxEmailStatus.Failed)
            .ExecuteUpdateAsync(s => s
                .SetProperty(e => e.Status, OutboxEmailStatus.Pending)
                .SetProperty(e => e.Attempts, 0)
                .SetProperty(e => e.LastError, (string?)null)
                .SetProperty(e => e.NextAttemptAt, now), ct);
        return Result<int>.Success(count);
    }
}

// ── Discard one row ──────────────────────────────────────────────────────────
public record DeleteOutboxEmailCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteOutboxEmailHandler(IApplicationDbContext context) : IRequestHandler<DeleteOutboxEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteOutboxEmailCommand request, CancellationToken ct)
    {
        var deleted = await context.OutboxEmails.Where(e => e.Id == request.Id).ExecuteDeleteAsync(ct);
        return deleted == 0 ? Result<bool>.Failure("Email introuvable.") : Result<bool>.Success(true);
    }
}

// ── Purge Sent rows (housekeeping — the outbox never auto-prunes) ─────────────
public record PurgeSentOutboxEmailsCommand(DateTime? Before) : IRequest<Result<int>>;

public class PurgeSentOutboxEmailsHandler(IApplicationDbContext context) : IRequestHandler<PurgeSentOutboxEmailsCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(PurgeSentOutboxEmailsCommand request, CancellationToken ct)
    {
        var query = context.OutboxEmails.Where(e => e.Status == OutboxEmailStatus.Sent);
        if (request.Before is { } before)
        {
            // sent_at is a timestamptz column; a query-string date arrives Kind=Unspecified → normalize to UTC.
            var beforeUtc = before.AsUtc();
            query = query.Where(e => e.SentAt != null && e.SentAt < beforeUtc);
        }
        var count = await query.ExecuteDeleteAsync(ct);
        return Result<int>.Success(count);
    }
}
