using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Calendar;
using GNDJ.Infrastructure.Persistence;

namespace GNDJ.Api.Services;

// Every 10 minutes: sends the due reminders of calendar events (see CalendarReminders). A failed run is logged and
// retried at the next interval.
public class CalendarReminderBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "calendar-reminders";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CalendarReminderBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(2); // let startup migrations/seeding finish

    public CalendarReminderBackgroundService(IServiceScopeFactory scopeFactory, ILogger<CalendarReminderBackgroundService> logger, IJobMonitor jobs)
    {
        _jobs = jobs;
        _jobs.Register(JobKey, "Rappels du calendrier", TimeSpan.FromMinutes(10));
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
                var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
                var sent = await CalendarReminders.RunAsync(context, notifications, stoppingToken);
                if (sent > 0) _logger.LogInformation("Calendar: {Count} reminder(s) sent.", sent);
                _jobs.Succeeded(JobKey);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogError(ex, "Calendar reminders run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
