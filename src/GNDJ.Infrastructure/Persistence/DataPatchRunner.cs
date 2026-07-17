using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Persistence;

// Applies one-off DATA patches to the database exactly once each, at startup, right after EF migrations +
// seeders. Patches are idempotent .sql files shipped in <ContentRoot>/DataPatches (copied from deploy/patches).
// A `data_patches` table records which have already run, so a patch is applied at most once per database and
// is skipped on every later startup — adding a new patch file runs only that new one on the next deploy.
//
// This exists for data changes NOT carried by EF migrations or the seeders (e.g. merging/renaming a role).
// It never copies dev data to prod — only the committed, reviewed patch files run, against the DB's own rows.
public static class DataPatchRunner
{
    public static async Task RunAsync(GndjDbContext context, string patchesDirectory, ILogger logger)
    {
        if (!Directory.Exists(patchesDirectory))
        {
            logger.LogInformation("No DataPatches directory at {Dir} — no data patches to apply.", patchesDirectory);
            return;
        }

        // Ordinal sort → 001_, 002_, … applied in sequence.
        var files = Directory.GetFiles(patchesDirectory, "*.sql")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal)
            .ToList();
        if (files.Count == 0) return;

        // Tracking table: one row per applied patch filename (created on first run).
        await context.Database.ExecuteSqlRawAsync(
            "CREATE TABLE IF NOT EXISTS data_patches (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");

        // Already-applied filenames (EF scalar query needs the column aliased "Value").
        var applied = await context.Database
            .SqlQueryRaw<string>("SELECT filename AS \"Value\" FROM data_patches")
            .ToListAsync();
        var appliedSet = applied.ToHashSet(StringComparer.Ordinal);

        foreach (var file in files)
        {
            var name = Path.GetFileName(file);
            if (appliedSet.Contains(name)) continue;   // ran once already → never again

            var sql = await File.ReadAllTextAsync(file);
            logger.LogInformation("Applying data patch {Patch}…", name);

            // Run the patch body AND its tracking row in ONE transaction so they commit atomically — either the
            // patch fully applies and is recorded, or nothing changes. (Patch files must therefore NOT contain
            // their own BEGIN/COMMIT — that would fight this ambient transaction.)
            await using var tx = await context.Database.BeginTransactionAsync();
            try
            {
                await context.Database.ExecuteSqlRawAsync(sql);
                await context.Database.ExecuteSqlRawAsync(
                    "INSERT INTO data_patches (filename) VALUES ({0}) ON CONFLICT (filename) DO NOTHING", name);
                await tx.CommitAsync();
                logger.LogInformation("Data patch {Patch} applied.", name);
            }
            catch (Exception ex)
            {
                // Roll back cleanly and — importantly — do NOT crash startup. A supplementary data patch must
                // never take the whole site down: log loudly (Serilog → file + DB), leave it unrecorded so it
                // retries on the next boot, and stop processing further patches (a later one may depend on it).
                await tx.RollbackAsync();
                logger.LogError(ex, "Data patch {Patch} FAILED and was rolled back — it will be retried on next startup. Skipping remaining patches.", name);
                break;
            }
        }
    }
}
