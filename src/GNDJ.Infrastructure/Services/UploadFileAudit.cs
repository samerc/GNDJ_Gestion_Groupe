using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.SystemHealth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Finds (and deletes) files under uploads/documents and uploads/photos that no database row points to.
// References are read INCLUDING soft-deleted rows (a member in the Corbeille keeps their files until the purge),
// and compared by file name (paths are stored relative, with either slash). Files younger than a day are skipped
// so an upload in progress is never touched. Singleton; own DB scope.
public class UploadFileAudit : IUploadFileAudit
{
    private static readonly string[] Folders = ["documents", "photos"];
    private static readonly TimeSpan MinAge = TimeSpan.FromDays(1);
    private const int MaxListed = 500;
    private const int MaxBulkOrphans = 20; // above this, orphans may not be the majority of files (see DeleteOrphansAsync)

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<UploadFileAudit> _logger;

    public UploadFileAudit(IServiceScopeFactory scopeFactory, ILogger<UploadFileAudit> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task<OrphanFileReportDto> FindOrphansAsync(CancellationToken ct = default)
    {
        var (scanned, orphans) = await ScanAsync(ct);
        return new OrphanFileReportDto(scanned, orphans.Count, orphans.Sum(o => o.SizeBytes),
            orphans.OrderByDescending(o => o.SizeBytes).Take(MaxListed).ToList());
    }

    public async Task<(int Deleted, long FreedBytes)> DeleteOrphansAsync(CancellationToken ct = default)
    {
        var (scanned, orphans) = await ScanAsync(ct);
        // Safety stop: when most files look unreferenced it's far more likely the app is reading the wrong folder
        // or a wrong database than that the files are really abandoned — refuse instead of wiping everything.
        if (orphans.Count > MaxBulkOrphans && orphans.Count * 2 > scanned)
            throw new InvalidOperationException(
                $"{orphans.Count} fichiers sur {scanned} semblent orphelins : c'est anormalement élevé (mauvais dossier ou mauvaise base ?). Rien n'a été supprimé.");
        var root = UploadsRoot();
        int deleted = 0;
        long freed = 0;
        foreach (var o in orphans)
        {
            var path = Path.GetFullPath(Path.Combine(root, o.Folder, o.Name));
            if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue; // traversal guard
            try
            {
                File.Delete(path);
                deleted++;
                freed += o.SizeBytes;
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Could not delete stray upload {Path}", path); }
        }
        _logger.LogInformation("Stray uploads cleanup: {Deleted} file(s) deleted, {Bytes} bytes freed", deleted, freed);
        return (deleted, freed);
    }

    private static string UploadsRoot() => Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));

    private async Task<(int Scanned, List<OrphanFileDto> Orphans)> ScanAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

        var docPaths = await db.MemberDocuments.IgnoreQueryFilters().Select(d => d.FilePath).ToListAsync(ct);
        var pagePaths = await db.MemberDocumentPages.IgnoreQueryFilters().Select(p => p.FilePath).ToListAsync(ct);
        var photoPaths = await db.Members.IgnoreQueryFilters().Where(m => m.PhotoPath != null).Select(m => m.PhotoPath!).ToListAsync(ct);
        var referenced = new HashSet<string>(
            docPaths.Concat(pagePaths).Concat(photoPaths).Where(p => !string.IsNullOrWhiteSpace(p)).Select(FileNameOf),
            StringComparer.OrdinalIgnoreCase);

        var root = UploadsRoot();
        var cutoff = DateTime.UtcNow - MinAge;
        var scanned = 0;
        var orphans = new List<OrphanFileDto>();
        foreach (var folder in Folders)
        {
            var dir = Path.Combine(root, folder);
            if (!Directory.Exists(dir)) continue;
            foreach (var file in Directory.EnumerateFiles(dir))
            {
                scanned++;
                var info = new FileInfo(file);
                if (referenced.Contains(info.Name) || info.LastWriteTimeUtc > cutoff) continue;
                orphans.Add(new OrphanFileDto(folder, info.Name, info.Length, info.LastWriteTimeUtc));
            }
        }
        return (scanned, orphans);
    }

    private static string FileNameOf(string path) => path.Replace('\\', '/').Split('/').Last();
}
