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

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
                await email.SendAsync(job.TemplateCode, job.ToEmail, job.Variables, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send queued email '{Code}' to {To}", job.TemplateCode, job.ToEmail);
            }
        }
    }
}
