using System.Collections.Concurrent;
using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GNDJ.Infrastructure.Services;

// Singleton ISlowRequestLog: a bounded ring of recent slow requests + per-route aggregates (bounded too).
public class SlowRequestLog : ISlowRequestLog
{
    private const int MaxRecent = 200;
    private const int MaxRoutes = 300;

    private readonly ConcurrentQueue<SlowRequestEntry> _recent = new();
    private readonly ConcurrentDictionary<string, Agg> _routes = new();

    private sealed class Agg
    {
        public required string Method, Route;
        public int Count;
        public long MaxMs, TotalMs;
        public DateTime LastAt;
        public readonly HashSet<string> Roles = [];
    }

    public SlowRequestLog(IConfiguration config)
    {
        ThresholdMs = int.TryParse(config["Monitoring:SlowRequestMs"], out var ms) && ms > 0 ? ms : 2000;
    }

    public int ThresholdMs { get; }

    public void Record(string method, string route, int statusCode, long elapsedMs, string role)
    {
        var now = DateTime.UtcNow;
        _recent.Enqueue(new SlowRequestEntry(now, method, route, statusCode, elapsedMs, role));
        while (_recent.Count > MaxRecent && _recent.TryDequeue(out _)) { }

        var key = method + " " + route;
        if (!_routes.ContainsKey(key) && _routes.Count >= MaxRoutes) return; // cap distinct routes (junk URLs)
        var agg = _routes.GetOrAdd(key, _ => new Agg { Method = method, Route = route });
        lock (agg)
        {
            agg.Count++;
            agg.TotalMs += elapsedMs;
            agg.MaxMs = Math.Max(agg.MaxMs, elapsedMs);
            agg.LastAt = now;
            agg.Roles.Add(role);
        }
    }

    public IReadOnlyList<SlowRouteStat> ByRoute() =>
        _routes.Values.Select(a =>
        {
            lock (a)
                return new SlowRouteStat(a.Method, a.Route, a.Count, a.MaxMs, a.TotalMs / Math.Max(1, a.Count), a.LastAt,
                    string.Join(", ", a.Roles.Order()));
        }).OrderByDescending(s => s.AvgMs).ToList();

    public IReadOnlyList<SlowRequestEntry> Recent() => _recent.Reverse().ToList();
}
