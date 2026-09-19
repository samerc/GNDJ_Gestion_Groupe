namespace GNDJ.Application.Common.Interfaces;

// Persists the yearly audit-log archive (a CSV of the whole trail) to a durable, NON-web-served directory
// so it survives an app restart/deploy and can be attached to the notification email + synced off-server by
// the ops backup job. Deliberately NOT uploads/content (that folder is served anonymously) — the archive
// holds emails/IPs/PII. Throws if the write fails, so the caller does NOT proceed to delete the trail.
public interface IAuditArchiveStorage
{
    // Writes the CSV under the archive directory (config AuditArchive:Directory, else <cwd>/archives/audit)
    // and returns the ABSOLUTE path of the stored file (used as the email's per-send attachment path).
    Task<string> SaveAsync(string fileName, byte[] content, CancellationToken ct = default);
}
