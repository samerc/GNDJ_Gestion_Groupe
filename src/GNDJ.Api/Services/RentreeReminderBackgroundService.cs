using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Rentree;
using GNDJ.Infrastructure.Persistence;

namespace GNDJ.Api.Services;

// Periodic job (every 12h) that sends the weekly rentrée reminder digest: each assignee gets ONE email listing
// their overdue / upcoming checklist tasks. RentreeReminders.RunIfDueAsync owns the "is it due?" (weekly) +
// enabled checks and stamps the last-sent marker, so this service just calls it. A failed run is logged + retried.
public class RentreeReminderBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RentreeReminderBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(12);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(4); // let startup migrations/seeding finish

    public RentreeReminderBackgroundService(IServiceScopeFactory scopeFactory, ILogger<RentreeReminderBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
                var emailQueue = scope.ServiceProvider.GetRequiredService<IEmailQueue>();
                var sent = await RentreeReminders.RunIfDueAsync(context, emailQueue, stoppingToken);
                if (sent > 0) _logger.LogInformation("Rentrée reminders: queued {Count} digest email(s).", sent);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _logger.LogError(ex, "Rentrée reminder run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
