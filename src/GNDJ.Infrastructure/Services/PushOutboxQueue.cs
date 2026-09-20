using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Durable implementation of IPushQueue: enqueuing WRITES push_outbox rows (in its own DI scope/transaction),
// then signals the background sender. Singleton so it can be injected anywhere (even other singletons like
// NotificationService). Best-effort — never throws into the caller: a lost push must not roll back the
// triggering action (the in-app Notification row still exists).
public class PushOutboxQueue : IPushQueue
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IPushSignal _signal;
    private readonly ILogger<PushOutboxQueue> _logger;

    public PushOutboxQueue(IServiceScopeFactory scopeFactory, IPushSignal signal, ILogger<PushOutboxQueue> logger)
    {
        _scopeFactory = scopeFactory;
        _signal = signal;
        _logger = logger;
    }

    public Task EnqueueAsync(PushJob job, CancellationToken ct = default) => EnqueueManyAsync([job], ct);

    public async Task EnqueueManyAsync(IEnumerable<PushJob> jobs, CancellationToken ct = default)
    {
        var list = jobs.Where(j => j.MemberId != Guid.Empty).ToList();
        if (list.Count == 0) return;
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            var now = DateTime.UtcNow;
            foreach (var job in list)
                context.PushOutbox.Add(new PushOutbox
                {
                    MemberId = job.MemberId,
                    Title = Trunc(job.Title, 300) ?? string.Empty,
                    Body = Trunc(job.Body, 2000),
                    Url = Trunc(job.Url, 500),
                    Type = Trunc(job.Type, 50),
                    Status = PushOutboxStatus.Pending,
                    CreatedAt = now,
                    NextAttemptAt = now,
                });
            await context.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist {Count} push outbox row(s)", list.Count);
            return;
        }
        _signal.Notify();
    }

    private static string? Trunc(string? s, int max) => s is null ? null : s.Length <= max ? s : s[..max];
}
