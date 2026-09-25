namespace GNDJ.Application.Common.Interfaces;

// Keeps a record of API requests slower than the threshold (since the last restart), so the Système page can show
// which screens are slow in real use. Routes are normalised (ids replaced by {id}) so the same page aggregates.
public interface ISlowRequestLog
{
    int ThresholdMs { get; }
    void Record(string method, string route, int statusCode, long elapsedMs, string role);
    IReadOnlyList<SlowRouteStat> ByRoute();          // aggregated, slowest-average first
    IReadOnlyList<SlowRequestEntry> Recent();        // newest first
}

public record SlowRequestEntry(DateTime At, string Method, string Route, int StatusCode, long ElapsedMs, string Role);
public record SlowRouteStat(string Method, string Route, int Count, long MaxMs, long AvgMs, DateTime LastAt, string Roles);
