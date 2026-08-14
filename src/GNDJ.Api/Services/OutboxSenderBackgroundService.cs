using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Drains the persistent email outbox (email_outbox). Each sweep claims a batch of due Pending rows, sends
// them (bounded concurrency, off the request thread), and records the outcome (Sent, or a retry with backoff,
// or Failed after too many attempts). Because the queue is a DB table, mail survives restarts/crashes and is
// delivered at-least-once — unlike the old in-memory Channel, which lost anything queued when the process died.
public class OutboxSenderBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOutboxSignal _signal;
    private readonly ILogger<OutboxSenderBackgroundService> _logger;

    public OutboxSenderBackgroundService(IServiceScopeFactory scopeFactory, IOutboxSignal signal,
        ILogger<OutboxSenderBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _signal = signal;
        _logger = logger;
    }

    private const int BatchSize = 20;          // rows claimed per sweep
    private const int MaxConcurrency = 5;      // parallel SMTP sends (latency-bound; modest to respect provider limits)
    private const int MaxAttempts = 5;         // give-up threshold → Status.Failed
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(30);   // per-attempt SMTP timeout
    private static readonly TimeSpan Lease = TimeSpan.FromMinutes(2);          // claim window; a crash mid-send retries after this
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(15);  // fallback poll when no wake signal
    // Backoff before the Nth retry (index = attempts already made − 1). After the last, the row is Failed.
    private static readonly TimeSpan[] Backoff =
        [TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30)];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            int processed;
            try
            {
                processed = await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break; // shutting down
            }
            catch (Exception ex)
            {
                // A sweep-level failure (e.g. DB unreachable) must not kill the worker — log and back off.
                _logger.LogWarning(ex, "Outbox sweep failed; backing off");
                processed = 0;
            }

            // If we filled a full batch, more may be due — loop immediately. Otherwise wait for a wake signal
            // (new mail enqueued) or the poll interval, whichever comes first.
            if (processed < BatchSize)
                await _signal.WaitAsync(PollInterval, stoppingToken);
        }
    }

    // One sweep: claim up to BatchSize due rows, send them, persist outcomes. Returns how many were claimed.
    private async Task<int> SweepAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

        var now = DateTime.UtcNow;
        // Claim due Pending rows (oldest first). Lease them by pushing NextAttemptAt into the future so a crash
        // mid-send doesn't strand them (they become due again after the lease) and re-entrancy can't double-grab.
        var due = await context.OutboxEmails
            .Where(e => e.Status == OutboxEmailStatus.Pending && e.NextAttemptAt <= now)
            .OrderBy(e => e.CreatedAt)
            .Take(BatchSize)
            .ToListAsync(ct);

        if (due.Count == 0) return 0;

        var leaseUntil = now.Add(Lease);
        foreach (var row in due) row.NextAttemptAt = leaseUntil;
        await context.SaveChangesAsync(ct); // commit the claim before we start sending

        // Resolve each row's delivery route (which SMTP server + its optional per-hour cap) and split the batch
        // into rows to send NOW vs rows to defer to a future rate-limit slot. Route resolution is sequential
        // (shares this sweep's scope/DbContext) and cached per template code within the sweep.
        //
        // Rate-limiting model = ROLLING-HOUR COUNT (re-derived from the durable table every sweep, so it needs
        // no in-memory cursor and can't drift or "run away"): a capped server may dispatch while its count of
        // rows Sent in the last hour is below the cap; once at the cap, further rows are deferred to when the
        // window frees (the oldest in-window send ages out), staggered one interval apart. This guarantees
        // ≤ cap sends in any rolling hour and survives restarts/crashes for free (the counts live in the DB).
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var routeCache = new Dictionary<string, EmailRoute?>();
        var toSendNow = new List<OutboxEmail>();
        var hourCount = new Dictionary<Guid, int>();       // server → rows Sent in the last hour (+ reserved this sweep)
        var windowFree = new Dictionary<Guid, DateTime>(); // server → next time an over-cap row should re-check
        var windowStart = now.AddHours(-1);

        foreach (var row in due)
        {
            if (!routeCache.TryGetValue(row.TemplateCode, out var route))
            {
                route = await email.ResolveRouteAsync(row.TemplateCode, ct);
                routeCache[row.TemplateCode] = route;
            }
            if (route is not null) row.SmtpServerId = route.ServerId; // stamp for the admin view + rate counting

            var cap = route?.MaxPerHour ?? 0;
            if (route is null || cap <= 0)
            {
                toSendNow.Add(row); // un-throttled (or route unknown → let the real send surface the error)
                continue;
            }

            var serverId = route.ServerId;
            if (!hourCount.TryGetValue(serverId, out var used))
            {
                // How many this server has actually Sent in the last rolling hour (committed, real sends only —
                // a failed attempt has no SentAt so it never counts against the cap).
                used = await context.OutboxEmails.CountAsync(
                    e => e.SmtpServerId == serverId && e.Status == OutboxEmailStatus.Sent
                         && e.SentAt != null && e.SentAt > windowStart, ct);
                hourCount[serverId] = used;
            }

            if (used < cap)
            {
                toSendNow.Add(row);
                hourCount[serverId] = used + 1; // reserve the slot within this sweep (optimistic; DB re-count self-heals)
            }
            else
            {
                // At the cap for the rolling hour → schedule this row for when a slot frees: the oldest in-window
                // send ages out one hour after it was sent. Stagger successive over-cap rows one interval apart so
                // they don't all wake at once.
                var interval = TimeSpan.FromSeconds(3600.0 / cap);
                if (!windowFree.TryGetValue(serverId, out var freeAt))
                {
                    var oldest = await context.OutboxEmails
                        .Where(e => e.SmtpServerId == serverId && e.Status == OutboxEmailStatus.Sent
                                    && e.SentAt != null && e.SentAt > windowStart)
                        .MinAsync(e => (DateTime?)e.SentAt, ct);
                    freeAt = (oldest ?? now).AddHours(1).AddSeconds(5); // small buffer past the exact roll
                    if (freeAt < now) freeAt = now.Add(interval);       // safety: never schedule in the past
                }
                row.NextAttemptAt = freeAt;
                windowFree[serverId] = freeAt.Add(interval); // next over-cap row targets the following freed slot
            }
        }

        // Send the "now" rows in parallel, each in its own scope (pooled DbContext/IEmailService aren't
        // concurrency-safe). Deferred rows already have their NextAttemptAt set above and are untouched here.
        var doneAt = now;
        if (toSendNow.Count > 0)
        {
            using var gate = new SemaphoreSlim(MaxConcurrency);
            var results = await Task.WhenAll(toSendNow.Select(async row =>
            {
                await gate.WaitAsync(ct);
                try { return (row.Id, ok: await TrySendAsync(row, ct), error: (string?)null); }
                catch (Exception ex) { return (row.Id, ok: false, error: ex.Message); }
                finally { gate.Release(); }
            }));

            var outcome = results.ToDictionary(r => r.Id, r => (r.ok, r.error));
            doneAt = DateTime.UtcNow;
            foreach (var row in toSendNow)
            {
                var (ok, error) = outcome[row.Id];
                row.Attempts++;
                if (ok)
                {
                    row.Status = OutboxEmailStatus.Sent;
                    row.SentAt = doneAt;
                    row.LastError = null;
                }
                else
                {
                    row.LastError = Truncate(error, 2000);
                    if (row.Attempts >= MaxAttempts)
                    {
                        row.Status = OutboxEmailStatus.Failed; // terminal — a human can inspect LastError
                        _logger.LogWarning("Outbox email '{Code}' to {To} FAILED after {Attempts} attempts: {Error}",
                            row.TemplateCode, row.ToEmail, row.Attempts, row.LastError);
                    }
                    else
                    {
                        // Stays Pending; retry after backoff (index = attempts already made − 1, clamped).
                        var idx = Math.Min(row.Attempts - 1, Backoff.Length - 1);
                        row.NextAttemptAt = doneAt.Add(Backoff[idx]);
                    }
                }
            }
        }

        await context.SaveChangesAsync(ct);
        // Return only the count actually SENT this sweep (not deferred): a defer-only sweep returns 0 so the
        // outer loop waits for the poll/signal instead of hot-looping through a large throttled backlog.
        return toSendNow.Count;
    }

    // Sends one row via IEmailService in a dedicated scope, with a per-attempt timeout. Returns true on success;
    // any throw (SMTP down, no active server, template missing, timeout) is a failure the caller records.
    private async Task<bool> TrySendAsync(OutboxEmail row, CancellationToken ct)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(SendTimeout);
        using var scope = _scopeFactory.CreateScope();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
        var vars = JsonSerializer.Deserialize<Dictionary<string, string>>(row.PayloadJson) ?? new();
        await email.SendAsync(row.TemplateCode, row.ToEmail, vars, timeoutCts.Token);
        return true;
    }

    private static string? Truncate(string? s, int max)
        => string.IsNullOrEmpty(s) || s.Length <= max ? s : s[..max];
}
