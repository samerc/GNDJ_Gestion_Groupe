using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Application.SystemHealth;

// ---- Système page / daily ops alert ----------------------------------------------------------------------------

// A durable outbox (emails or push). Stuck = still Pending more than StuckAfterHours after it was queued (the sender
// is stopped, or the provider keeps refusing). FailedLast24h excludes mail deliberately skipped because the address
// bounced (that's reported on "Qualité des données", not a system fault).
public record OutboxStats(int Pending, int Stuck, int FailedLast24h, int SentLast24h, DateTime? LastSentAt,
    List<OutboxFailureDto> RecentFailures);
public record OutboxFailureDto(DateTime At, string What, string To, string? Error);

// Free space on the disk that holds the app (and its uploads). UploadsBytes = the uploads folder size.
public record DiskStats(string Drive, long TotalBytes, long FreeBytes, double FreePercent, long UploadsBytes, bool Low);

public record SystemStatusDto(
    DateTime ServerStartedAt,
    string Environment,
    List<JobStatus> Jobs,
    OutboxStats Email,
    OutboxStats Push,
    DiskStats? Disk,
    int SlowThresholdMs,
    List<SlowRouteStat> SlowRoutes,
    List<SlowRequestEntry> RecentSlow,
    List<ConfigIssue> ConfigIssues,
    List<string> Problems); // plain-language list of what needs attention (empty = all good)

public interface ISystemHealthService
{
    // StuckAfter: how old a Pending outbox row must be to count as stuck.
    Task<SystemStatusDto> GetStatusAsync(CancellationToken ct = default);
}

// ---- Stray upload files --------------------------------------------------------------------------------------

// A file under uploads/documents or uploads/photos that no database row points to (left by a failed upload, or a
// delete that removed the row but not the file). Only files older than a day are listed, so an upload in progress
// is never touched. uploads/content (CMS images, template files) is NOT scanned: those are referenced from HTML
// and JSON in many places, so "unreferenced" can't be decided safely.
public record OrphanFileDto(string Folder, string Name, long SizeBytes, DateTime ModifiedAt);
public record OrphanFileReportDto(int ScannedFiles, int Count, long TotalBytes, List<OrphanFileDto> Files);

public interface IUploadFileAudit
{
    Task<OrphanFileReportDto> FindOrphansAsync(CancellationToken ct = default);
    // Deletes the orphans found by a fresh scan (never trusts a client list). Returns how many were deleted.
    Task<(int Deleted, long FreedBytes)> DeleteOrphansAsync(CancellationToken ct = default);
}
