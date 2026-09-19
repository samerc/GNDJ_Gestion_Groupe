using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GNDJ.Infrastructure.Services;

// Writes the yearly audit archive CSV to a durable, NON-web-served folder. On prod set
// AuditArchive:Directory to a folder OUTSIDE the site (e.g. C:\gndj-backups\audit) so a deploy never wipes
// it and the ops backup job (backup-db.ps1) rclone-syncs it off-server. In dev it defaults to
// <cwd>/archives/audit. This folder is NEVER served by ContentFilesController (which is uploads/content only),
// so the archive's emails/IPs/PII are not exposed by URL.
public class AuditArchiveStorage : IAuditArchiveStorage
{
    private readonly IConfiguration _config;
    public AuditArchiveStorage(IConfiguration config) => _config = config;

    public async Task<string> SaveAsync(string fileName, byte[] content, CancellationToken ct = default)
    {
        var dir = _config["AuditArchive:Directory"];
        if (string.IsNullOrWhiteSpace(dir))
            dir = Path.Combine(Directory.GetCurrentDirectory(), "archives", "audit");
        Directory.CreateDirectory(dir);

        var safe = Path.GetFileName(fileName); // strip any path components — defensive
        var path = Path.Combine(dir, safe);
        await File.WriteAllBytesAsync(path, content, ct);
        return Path.GetFullPath(path);
    }
}
