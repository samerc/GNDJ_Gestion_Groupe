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

        // Send in parallel, each in its own scope (pooled DbContext/IEmailService aren't concurrency-safe).
        using var gate = new SemaphoreSlim(MaxConcurrency);
        var results = await Task.WhenAll(due.Select(async row =>
        {
            await gate.WaitAsync(ct);
            try { return (row.Id, ok: await TrySendAsync(row, ct), error: (string?)null); }
            catch (Exception ex) { return (row.Id, ok: false, error: ex.Message); }
            finally { gate.Release(); }
        }));

        // Apply outcomes to the tracked rows and persist in one write.
        var outcome = results.ToDictionary(r => r.Id, r => (r.ok, r.error));
        var doneAt = DateTime.UtcNow;
        foreach (var row in due)
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
        await context.SaveChangesAsync(ct);
        return due.Count;
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
