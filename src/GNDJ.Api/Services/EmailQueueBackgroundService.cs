using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Services;

namespace GNDJ.Api.Services;

// Drains the email queue and sends each message in its own DI scope, off the request thread.
public class EmailQueueBackgroundService : BackgroundService
{
    private readonly EmailQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EmailQueueBackgroundService> _logger;

    public EmailQueueBackgroundService(EmailQueue queue, IServiceScopeFactory scopeFactory, ILogger<EmailQueueBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    // Between-attempt backoff (attempt 1→2, then 2→3). 3 attempts total per email.
    private static readonly TimeSpan[] RetryDelays = [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5)];
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
            await SendWithRetryAsync(job, stoppingToken);
    }

    // Send one job with a per-attempt timeout + bounded retry. Without the timeout, a hung/slow SMTP server
    // would block the single-reader worker indefinitely — the queue backs up and (being bounded) starts
    // silently dropping new mail. On repeated failure we log and DROP this one so the worker keeps draining.
    private async Task SendWithRetryAsync(EmailJob job, CancellationToken stoppingToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            timeoutCts.CancelAfter(SendTimeout);
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
                await email.SendAsync(job.TemplateCode, job.ToEmail, job.Variables, timeoutCts.Token);
                return; // sent
            }
            catch (Exception ex)
            {
                if (stoppingToken.IsCancellationRequested) return; // app shutting down — stop, not a send failure
                if (attempt >= RetryDelays.Length)
                {
                    _logger.LogWarning(ex, "Dropping queued email '{Code}' to {To} after {Attempts} attempt(s)",
                        job.TemplateCode, job.ToEmail, attempt + 1);
                    return; // give up on this one, keep draining the queue
                }
                _logger.LogWarning(ex, "Queued email '{Code}' to {To} failed (attempt {Attempt}), retrying",
                    job.TemplateCode, job.ToEmail, attempt + 1);
                try { await Task.Delay(RetryDelays[attempt], stoppingToken); }
                catch (OperationCanceledException) { return; }
            }
        }
    }
}
