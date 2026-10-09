using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Passages;
using GNDJ.Infrastructure.Persistence;

namespace GNDJ.Api.Services;

// Every 6 hours: while the passage is open, reminds the leaders of units that haven't finished their passage,
// once 7 days and once 2 days before passage.date (see PassageReminders.RunAutoAsync). A failed run is logged
// and retried at the next interval.
public class PassageReminderBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "passage-reminders";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PassageReminderBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    // Let startup migrations/seeding finish. Monitoring:PassageReminderInitialDelaySeconds overrides it (tests).
    private readonly TimeSpan InitialDelay;

    public PassageReminderBackgroundService(IServiceScopeFactory scopeFactory, ILogger<PassageReminderBackgroundService> logger, IJobMonitor jobs,
        IConfiguration config)
    {
        InitialDelay = int.TryParse(config["Monitoring:PassageReminderInitialDelaySeconds"], out var sec) && sec >= 0
            ? TimeSpan.FromSeconds(sec) : TimeSpan.FromMinutes(7);
        _jobs = jobs;
        _jobs.Register(JobKey, "Rappels du passage aux unités", Interval);
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
                var emailQueue = scope.ServiceProvider.GetRequiredService<IEmailQueue>();
                var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
                var r = await PassageReminders.RunAutoAsync(context, emailQueue, notifications, stoppingToken);
                if (r is not null)
                    _logger.LogInformation("Passage reminders: {Units} unit(s), {Emails} email(s), {Notified} notification(s).", r.Units, r.Emails, r.Notified);
                _jobs.Succeeded(JobKey);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogError(ex, "Passage reminder run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
