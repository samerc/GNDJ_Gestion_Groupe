namespace GNDJ.Application.Common.Interfaces;

// In-memory "is this background job alive?" tracker. Each background service registers itself once (key, French
// label, how often it is expected to run) and reports every run's outcome. The Système page and the daily ops alert
// read the snapshot to spot a job that has stopped or keeps failing. In memory on purpose: it describes the CURRENT
// process (a restart starts clean, and "since startup" is exactly what we want to know).
public interface IJobMonitor
{
    void Register(string key, string label, TimeSpan expectedInterval);
    void Succeeded(string key);
    void Failed(string key, Exception ex);
    IReadOnlyList<JobStatus> Snapshot();
    DateTime StartedAt { get; }
}

// Stale = the job has not run for well beyond its expected interval (stopped / stuck), counted from startup when it
// has never run. Failing = its most recent run ended in an error.
public record JobStatus(
    string Key,
    string Label,
    int ExpectedIntervalMinutes,
    DateTime? LastRunAt,
    DateTime? LastSuccessAt,
    DateTime? LastErrorAt,
    string? LastError,
    int ConsecutiveFailures,
    bool Stale,
    bool Failing);
