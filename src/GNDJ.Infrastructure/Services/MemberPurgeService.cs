using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Permanently deletes soft-deleted members past the retention window, with their login and ALL connected data
// (+ files on disk). FK-safe order: clear the RESTRICT children first (assignments, passages, relationships,
// camp entries, users) and unlink the demande, then delete the member row (its CASCADE children go with it),
// then any now-orphaned SHARED guardians (kept if still linked to a sibling). Raw SQL bypasses the soft-delete
// interceptor so this is a real physical delete.
public class MemberPurgeService : IMemberPurgeService
{
    private readonly GndjDbContext _context;
    private readonly ILogger<MemberPurgeService> _logger;

    public MemberPurgeService(GndjDbContext context, ILogger<MemberPurgeService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<int> PurgeExpiredAsync(int retentionDays, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(-Math.Max(1, retentionDays));
        var ids = await _context.Members.IgnoreQueryFilters()
            .Where(m => m.IsDeleted && m.DeletedAt != null && m.DeletedAt <= cutoff)
            .Select(m => m.Id)
            .ToListAsync(ct);

        var purged = 0;
        foreach (var id in ids)
        {
            try { await PurgeAsync(id, ct); purged++; }
            catch (Exception ex) { _logger.LogError(ex, "Failed to purge member {MemberId} — will retry next run.", id); }
        }
        if (purged > 0)
            _logger.LogInformation("Purged {Count} member(s) past the {Days}-day retention window.", purged, retentionDays);
        return purged;
    }

    public async Task PurgeAsync(Guid memberId, CancellationToken ct = default)
    {
        // Capture file paths + linked guardian ids BEFORE the rows are gone.
        var photoPath = (await _context.Database.SqlQueryRaw<string>(
            "SELECT photo_path AS \"Value\" FROM members WHERE id = {0}", memberId).ToListAsync(ct)).FirstOrDefault();
        var docPaths = await _context.Database.SqlQueryRaw<string>(
            "SELECT file_path AS \"Value\" FROM member_documents WHERE member_id = {0}", memberId).ToListAsync(ct);
        // Extra document pages (their rows cascade with the document, but capture the files to delete from disk).
        var pagePaths = await _context.Database.SqlQueryRaw<string>(
            "SELECT p.file_path AS \"Value\" FROM member_document_pages p JOIN member_documents d ON d.id = p.member_document_id WHERE d.member_id = {0}", memberId).ToListAsync(ct);
        var guardianIds = await _context.Database.SqlQueryRaw<Guid>(
            "SELECT guardian_id AS \"Value\" FROM guardian_links WHERE member_id = {0}", memberId).ToListAsync(ct);

        await using var tx = await _context.Database.BeginTransactionAsync(ct);
        try
        {
            var p = new object[] { memberId };
            // RESTRICT children first (each would otherwise block the member delete).
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM member_assignments WHERE member_id = {0}", p, ct);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM passages WHERE member_id = {0}", p, ct);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM camp_game_etapistes WHERE member_id = {0}", p, ct);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM camp_participants WHERE member_id = {0}", p, ct);
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM users WHERE member_id = {0}", p, ct);
            // Keep the demande history; just unlink the converted member (RESTRICT reference).
            await _context.Database.ExecuteSqlRawAsync("UPDATE demandes SET created_member_id = NULL WHERE created_member_id = {0}", p, ct);

            // The member row → CASCADE removes contacts / guardian_links / documents / cotisations(+payments) /
            // custom_field_values / progressions / change_requests; SET NULL unbinds api_keys / applicant
            // scout-relations / camp familles Père-Mère.
            await _context.Database.ExecuteSqlRawAsync("DELETE FROM members WHERE id = {0}", p, ct);

            // Now-orphaned SHARED guardians (only ever linked to this member) → delete (cascades phones/emails).
            // A guardian still linked to a sibling is left untouched.
            if (guardianIds.Count > 0)
                await _context.Database.ExecuteSqlRawAsync(
                    "DELETE FROM guardians g WHERE g.id = ANY({0}) AND NOT EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.guardian_id = g.id)",
                    [guardianIds.ToArray()], ct);

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        // Files last — outside the transaction, so a missing/locked file can't undo the DB purge.
        DeleteFileSafe(photoPath);
        foreach (var d in docPaths) DeleteFileSafe(d);
        foreach (var d in pagePaths) DeleteFileSafe(d);
    }

    // Best-effort delete of a member file stored under the app's uploads tree. Handles both stored formats
    // ("uploads/documents/x" and the migrated "photos/x") and never deletes anything outside the app folder.
    private void DeleteFileSafe(string? storedPath)
    {
        if (string.IsNullOrWhiteSpace(storedPath)) return;
        var cwd = Path.GetFullPath(Directory.GetCurrentDirectory());
        var norm = storedPath.Replace('\\', '/').TrimStart('/');
        var candidates = new List<string> { Path.Combine(cwd, norm) };
        if (!norm.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
            candidates.Add(Path.Combine(cwd, "uploads", norm)); // e.g. migrated "photos/18.jpg" → uploads/photos/18.jpg

        foreach (var c in candidates)
        {
            try
            {
                var full = Path.GetFullPath(c);
                if (!full.StartsWith(cwd, StringComparison.OrdinalIgnoreCase)) continue; // never escape the app folder
                if (File.Exists(full)) { File.Delete(full); return; }
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Could not delete file {Path} for purged member.", c); }
        }
    }
}
