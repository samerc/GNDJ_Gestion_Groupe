namespace GNDJ.Application.Common.Interfaces;

// Permanently (physically) deletes soft-deleted members once past the retention window — the member row, their
// login, ALL connected data (contacts, guardian links, documents, cotisations, progressions, assignments,
// passages, relationships, camp entries) and their files on disk. Runs from a background job.
public interface IMemberPurgeService
{
    // Purge every member soft-deleted more than retentionDays ago. Returns how many were purged. Each member
    // is purged in its own transaction; a failure on one is logged and doesn't stop the rest.
    Task<int> PurgeExpiredAsync(int retentionDays, CancellationToken ct = default);

    // Hard-delete one member and everything connected to them. Assumes the member is already soft-deleted.
    Task PurgeAsync(Guid memberId, CancellationToken ct = default);
}
