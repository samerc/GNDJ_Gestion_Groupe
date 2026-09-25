using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.SystemHealth;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GNDJ.Infrastructure.Services;

// Builds the Système page snapshot (jobs, outboxes, disk, slow pages, configuration checks) and the plain-language
// "Problems" list that the daily ops alert emails. Singleton; opens its own DB scope per call.
public class SystemHealthService : ISystemHealthService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IJobMonitor _jobs;
    private readonly ISlowRequestLog _slow;
    private readonly IConfiguration _config;

    // A Pending row older than this counts as stuck (the sender retries within ~45 min of backoff, so 2 h means
    // it's really not going out).
    private static readonly TimeSpan StuckAfter = TimeSpan.FromHours(2);
    // The ops alert's failed-mail threshold over 24 h (a couple of bad addresses are normal; a burst is not).
    private const int FailedAlertThreshold = 5;

    public SystemHealthService(IServiceScopeFactory scopeFactory, IJobMonitor jobs, ISlowRequestLog slow, IConfiguration config)
    {
        _scopeFactory = scopeFactory;
        _jobs = jobs;
        _slow = slow;
        _config = config;
    }

    public async Task<SystemStatusDto> GetStatusAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        var now = DateTime.UtcNow;
        var dayAgo = now.AddDays(-1);
        var stuckBefore = now - StuckAfter;

        // ---- Email outbox. Rows skipped because the address bounced are a data problem, not a system fault.
        const string bounceMark = "Adresse en échec";
        var email = await db.OutboxEmails.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Pending = g.Count(e => e.Status == OutboxEmailStatus.Pending),
                Stuck = g.Count(e => e.Status == OutboxEmailStatus.Pending && e.CreatedAt < stuckBefore),
                Failed = g.Count(e => e.Status == OutboxEmailStatus.Failed && e.CreatedAt >= dayAgo
                                      && (e.LastError == null || !e.LastError.StartsWith(bounceMark))),
                Sent = g.Count(e => e.Status == OutboxEmailStatus.Sent && e.SentAt >= dayAgo),
                LastSent = g.Max(e => e.SentAt),
            }).FirstOrDefaultAsync(ct);
        var emailFailures = await db.OutboxEmails.AsNoTracking()
            .Where(e => e.Status == OutboxEmailStatus.Failed && e.CreatedAt >= dayAgo
                        && (e.LastError == null || !e.LastError.StartsWith(bounceMark)))
            .OrderByDescending(e => e.CreatedAt).Take(10)
            .Select(e => new OutboxFailureDto(e.CreatedAt, e.TemplateCode, e.ToEmail, e.LastError)).ToListAsync(ct);
        var emailStats = new OutboxStats(email?.Pending ?? 0, email?.Stuck ?? 0, email?.Failed ?? 0, email?.Sent ?? 0,
            email?.LastSent, emailFailures);

        // ---- Push outbox.
        var push = await db.PushOutbox.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Pending = g.Count(p => p.Status == PushOutboxStatus.Pending),
                Stuck = g.Count(p => p.Status == PushOutboxStatus.Pending && p.CreatedAt < stuckBefore),
                Failed = g.Count(p => p.Status == PushOutboxStatus.Failed && p.CreatedAt >= dayAgo),
                Sent = g.Count(p => p.Status == PushOutboxStatus.Sent && p.SentAt >= dayAgo),
                LastSent = g.Max(p => p.SentAt),
            }).FirstOrDefaultAsync(ct);
        var pushFailures = await db.PushOutbox.AsNoTracking()
            .Where(p => p.Status == PushOutboxStatus.Failed && p.CreatedAt >= dayAgo)
            .OrderByDescending(p => p.CreatedAt).Take(10)
            .Select(p => new OutboxFailureDto(p.CreatedAt, p.Title, p.MemberId.ToString(), p.LastError)).ToListAsync(ct);
        var pushStats = new OutboxStats(push?.Pending ?? 0, push?.Stuck ?? 0, push?.Failed ?? 0, push?.Sent ?? 0,
            push?.LastSent, pushFailures);

        // ---- Configuration.
        var configIssues = new List<ConfigIssue>();
        configIssues.AddRange(await ConfigurationChecks.SettingsAsync(db, ct));
        configIssues.AddRange(await ConfigurationChecks.EmailTemplatesAsync(db, ct));

        var jobs = _jobs.Snapshot().ToList();
        var disk = ReadDisk();

        // ---- Plain-language problems (what the daily alert emails).
        var problems = new List<string>();
        foreach (var j in jobs.Where(j => j.Stale))
            problems.Add($"La tâche « {j.Label} » ne tourne plus (dernière exécution : {(j.LastRunAt is { } r ? $"{r:dd/MM HH:mm} UTC" : "jamais depuis le démarrage")}).");
        foreach (var j in jobs.Where(j => j.Failing && j.ConsecutiveFailures >= (j.ExpectedIntervalMinutes <= 5 ? 5 : 1)))
            problems.Add($"La tâche « {j.Label} » échoue ({j.ConsecutiveFailures} fois de suite) : {j.LastError}");
        if (emailStats.Stuck > 0)
            problems.Add($"{emailStats.Stuck} email(s) en attente depuis plus de {StuckAfter.TotalHours:0} h (non envoyés).");
        if (emailStats.FailedLast24h >= FailedAlertThreshold)
            problems.Add($"{emailStats.FailedLast24h} email(s) en échec sur les dernières 24 h.");
        if (pushStats.Stuck > 0)
            problems.Add($"{pushStats.Stuck} notification(s) push en attente depuis plus de {StuckAfter.TotalHours:0} h.");
        if (disk is { Low: true })
            problems.Add($"Espace disque faible sur {disk.Drive} : {Gb(disk.FreeBytes)} libres ({disk.FreePercent:0.#} %).");
        var configErrors = configIssues.Count(i => i.Severity == "error");
        if (configErrors > 0)
            problems.Add($"{configErrors} erreur(s) de configuration (paramètres ou modèles d'email) — voir la page Système.");

        return new SystemStatusDto(
            _jobs.StartedAt,
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
            jobs, emailStats, pushStats, disk,
            _slow.ThresholdMs, _slow.ByRoute().Take(30).ToList(), _slow.Recent().Take(50).ToList(),
            configIssues, problems);
    }

    // Free space of the drive holding the app folder. "Low" = under Monitoring:DiskLowPercent (default 10 %) or
    // under Monitoring:DiskLowGb (default 5 GB). Uploads size is summed from the folder (a few thousand files).
    private DiskStats? ReadDisk()
    {
        try
        {
            var appDir = Directory.GetCurrentDirectory();
            var drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(appDir))!);
            var total = drive.TotalSize;
            var free = drive.AvailableFreeSpace;
            var pct = total > 0 ? free * 100.0 / total : 0;
            var lowPct = double.TryParse(_config["Monitoring:DiskLowPercent"], out var p) ? p : 10;
            var lowGb = double.TryParse(_config["Monitoring:DiskLowGb"], out var g) ? g : 5;
            var uploads = Path.Combine(appDir, "uploads");
            long uploadsBytes = 0;
            if (Directory.Exists(uploads))
                foreach (var f in Directory.EnumerateFiles(uploads, "*", SearchOption.AllDirectories))
                    try { uploadsBytes += new FileInfo(f).Length; } catch { /* file vanished mid-scan */ }
            var low = pct < lowPct || free < lowGb * 1024 * 1024 * 1024;
            return new DiskStats(drive.Name, total, free, Math.Round(pct, 1), uploadsBytes, low);
        }
        catch { return null; }
    }

    private static string Gb(long bytes) => $"{bytes / 1024d / 1024 / 1024:0.#} Go";
}
