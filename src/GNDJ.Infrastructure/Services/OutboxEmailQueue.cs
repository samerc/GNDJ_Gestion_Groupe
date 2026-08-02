using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Durable implementation of IEmailQueue: enqueuing WRITES an email_outbox row (committed in its own DI
// scope/transaction), then signals the background sender. Singleton so it can be injected anywhere — even
// into other singletons (e.g. ErrorNotifier) — without a captive-dependency issue; it opens a fresh scope
// per enqueue to get a scoped DbContext. Replaces the old in-memory Channel (which lost mail on restart).
public class OutboxEmailQueue : IEmailQueue
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOutboxSignal _signal;
    private readonly ILogger<OutboxEmailQueue> _logger;

    public OutboxEmailQueue(IServiceScopeFactory scopeFactory, IOutboxSignal signal, ILogger<OutboxEmailQueue> logger)
    {
        _scopeFactory = scopeFactory;
        _signal = signal;
        _logger = logger;
    }

    public Task EnqueueAsync(EmailJob job, CancellationToken ct = default)
        => EnqueueManyAsync([job], ct);

    public async Task EnqueueManyAsync(IEnumerable<EmailJob> jobs, CancellationToken ct = default)
    {
        var list = jobs as IReadOnlyCollection<EmailJob> ?? jobs.ToList();
        if (list.Count == 0) return;

        // Fresh scope → scoped DbContext, so a singleton can persist. This is a SEPARATE transaction from the
        // caller's state change (the caller has already committed it), which is why we log — but never throw —
        // on failure: a triggering action must not be rolled back just because recording its email failed.
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            var now = DateTime.UtcNow;
            foreach (var job in list)
            {
                context.OutboxEmails.Add(new OutboxEmail
                {
                    TemplateCode = job.TemplateCode,
                    ToEmail = job.ToEmail,
                    PayloadJson = JsonSerializer.Serialize(job.Variables),
                    Status = OutboxEmailStatus.Pending,
                    CreatedAt = now,
                    NextAttemptAt = now, // due immediately
                });
            }
            await context.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // Best-effort: don't let an outbox write failure bubble into the caller. Log loudly so a broken
            // outbox is visible (Warning → also hits the DB log sink).
            _logger.LogWarning(ex, "Failed to persist {Count} outbox email(s) (first template '{Code}')",
                list.Count, list.First().TemplateCode);
            return;
        }

        _signal.Notify(); // wake the sender so it goes out now, not at the next poll
    }
}
