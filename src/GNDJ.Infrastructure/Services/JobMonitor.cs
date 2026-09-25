using System.Collections.Concurrent;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Singleton implementation of IJobMonitor (thread-safe: background services report from their own threads).
public class JobMonitor : IJobMonitor
{
    private sealed class Entry
    {
        public required string Label;
        public TimeSpan Interval;
        public DateTime? LastRunAt, LastSuccessAt, LastErrorAt;
        public string? LastError;
        public int ConsecutiveFailures;
    }

    private readonly ConcurrentDictionary<string, Entry> _jobs = new();
    public DateTime StartedAt { get; } = DateTime.UtcNow;

    // Grace added on top of 1.5 x the interval before a job is called stale: covers each service's start-up delay
    // and a slow run.
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(15);

    public void Register(string key, string label, TimeSpan expectedInterval) =>
        _jobs.AddOrUpdate(key, _ => new Entry { Label = label, Interval = expectedInterval },
            (_, e) => { e.Label = label; e.Interval = expectedInterval; return e; });

    public void Succeeded(string key)
    {
        if (!_jobs.TryGetValue(key, out var e)) return;
        lock (e)
        {
            e.LastRunAt = e.LastSuccessAt = DateTime.UtcNow;
            e.ConsecutiveFailures = 0;
        }
    }

    public void Failed(string key, Exception ex)
    {
        if (!_jobs.TryGetValue(key, out var e)) return;
        lock (e)
        {
            e.LastRunAt = e.LastErrorAt = DateTime.UtcNow;
            var msg = ex.GetBaseException().Message;
            e.LastError = msg.Length > 500 ? msg[..500] + "…" : msg;
            e.ConsecutiveFailures++;
        }
    }

    public IReadOnlyList<JobStatus> Snapshot()
    {
        var now = DateTime.UtcNow;
        return _jobs.Select(kv =>
        {
            var e = kv.Value;
            lock (e)
            {
                var reference = e.LastRunAt ?? StartedAt;
                var stale = now - reference > e.Interval * 1.5 + Grace;
                var failing = e.LastErrorAt is not null && (e.LastSuccessAt is null || e.LastErrorAt > e.LastSuccessAt);
                return new JobStatus(kv.Key, e.Label, (int)e.Interval.TotalMinutes, e.LastRunAt, e.LastSuccessAt,
                    e.LastErrorAt, e.LastError, e.ConsecutiveFailures, stale, failing);
            }
        }).OrderBy(j => j.Label).ToList();
    }
}
