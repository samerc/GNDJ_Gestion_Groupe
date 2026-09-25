using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Drains the durable push outbox (push_outbox): each sweep claims due Pending rows, fans each out to the
// member's device subscriptions via Web Push, deletes dead subscriptions (404/410), and records the outcome
// (Sent / retry with backoff / Failed). Because the queue is a DB table, pushes survive restarts and are
// delivered at-least-once. No-ops safely when VAPID isn't configured (rows just retry until keys are set).
public class PushSenderBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "push-outbox";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IPushSignal _signal;
    private readonly IWebPushSender _sender;
    private readonly ILogger<PushSenderBackgroundService> _logger;

    public PushSenderBackgroundService(IServiceScopeFactory scopeFactory, IPushSignal signal,
        IWebPushSender sender, ILogger<PushSenderBackgroundService> logger, IJobMonitor jobs)
    {
        _jobs = jobs;
        _jobs.Register(JobKey, "Envoi des notifications push", TimeSpan.FromMinutes(1));
        _scopeFactory = scopeFactory;
        _signal = signal;
        _sender = sender;
        _logger = logger;
    }

    private const int BatchSize = 50;
    private const int MaxAttempts = 5;
    private static readonly TimeSpan Lease = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30); // fallback poll; enqueue wakes it instantly
    private static readonly TimeSpan[] Backoff =
        [TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30)];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            int processed;
            try { processed = await SweepAsync(stoppingToken); _jobs.Succeeded(JobKey); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogWarning(ex, "Push sweep failed; backing off"); processed = 0; }

            if (processed < BatchSize)
                await _signal.WaitAsync(PollInterval, stoppingToken);
        }
    }

    private async Task<int> SweepAsync(CancellationToken ct)
    {
        // When VAPID isn't configured, don't churn: leave rows Pending and wait (they'll send once keys are set).
        if (!_sender.IsConfigured) return 0;

        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

        var now = DateTime.UtcNow;
        var due = await context.PushOutbox
            .Where(p => p.Status == PushOutboxStatus.Pending && p.NextAttemptAt <= now)
            // Order by NextAttemptAt so the (status, next_attempt_at) index yields rows already sorted (no
            // full-set sort each sweep). For fresh rows NextAttemptAt ≈ CreatedAt, so ordering is equivalent.
            .OrderBy(p => p.NextAttemptAt)
            .Take(BatchSize)
            .ToListAsync(ct);
        if (due.Count == 0) return 0;

        // Lease the batch (push NextAttemptAt into the future) so a crash mid-send retries after the lease.
        var leaseUntil = now.Add(Lease);
        foreach (var row in due) row.NextAttemptAt = leaseUntil;
        await context.SaveChangesAsync(ct);

        // Load the subscriptions for all members in this batch in one query.
        var memberIds = due.Select(p => p.MemberId).Distinct().ToList();
        var subsByMember = (await context.PushSubscriptions
                .Where(s => memberIds.Contains(s.MemberId))
                .ToListAsync(ct))
            .GroupBy(s => s.MemberId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var toDelete = new List<PushSubscription>();
        foreach (var row in due)
        {
            row.Attempts++;
            var subs = subsByMember.GetValueOrDefault(row.MemberId) ?? [];
            if (subs.Count == 0)
            {
                // Nothing to deliver to (member hasn't enabled push) — terminal success, not a failure.
                row.Status = PushOutboxStatus.Sent;
                row.SentAt = DateTime.UtcNow;
                row.LastError = "Aucun appareil abonné";
                continue;
            }

            var payload = JsonSerializer.Serialize(new
            {
                title = row.Title,
                body = row.Body,
                url = row.Url,
                type = row.Type,
            });

            var anyDelivered = false;
            var anyError = false;
            foreach (var sub in subs)
            {
                var result = await _sender.SendAsync(sub, payload, ct);
                if (result == PushSendResult.Sent) anyDelivered = true;
                else if (result == PushSendResult.Gone) toDelete.Add(sub); // dead subscription → prune
                else anyError = true;
            }

            if (anyDelivered || !anyError)
            {
                // Delivered to at least one device, OR the only failures were "gone" subs we've pruned → done.
                row.Status = PushOutboxStatus.Sent;
                row.SentAt = DateTime.UtcNow;
                row.LastError = anyDelivered ? null : "Tous les abonnements expirés";
            }
            else
            {
                row.LastError = "Échec de l'envoi push";
                if (row.Attempts >= MaxAttempts) row.Status = PushOutboxStatus.Failed;
                else
                {
                    var idx = Math.Min(row.Attempts - 1, Backoff.Length - 1);
                    row.NextAttemptAt = DateTime.UtcNow.Add(Backoff[idx]);
                }
            }
        }

        if (toDelete.Count > 0) context.PushSubscriptions.RemoveRange(toDelete.DistinctBy(s => s.Id));
        await context.SaveChangesAsync(ct);
        return due.Count;
    }
}
