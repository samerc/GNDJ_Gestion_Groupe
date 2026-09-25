using System.IO.Compression;
using System.Text.Json;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.NewYear;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Runs the "Nettoyage de nouvelle année" (see NewYearCleanupHandlers for the what/why). Singleton: owns the
// background task and opens its own scopes (the web request that starts it returns immediately). One run at a time
// (process-wide flag) and once per scout year (marker newyear.cleanup_done_for, written in the SAME transaction as
// the database changes).
//
// Order (crash-safe):
//   1. write the zip of every document to the archive folder (outside the website; copied off-server by backup),
//   2. ONE transaction: delete non-kept documents (+ pages), reset kept approvals (unless kept), clear sections,
//      promote classes, set the marker — a crash before the commit changes nothing and the run can simply restart,
//   3. delete the deleted documents' files (best-effort; a crash here only leaves orphan files).
public class NewYearCleanupService(IServiceScopeFactory scopes, IConfiguration config, ILogger<NewYearCleanupService> logger)
    : INewYearCleanupService
{
    private int _running; // 0/1 — Interlocked guard against two runs at once
    public bool IsRunning => Volatile.Read(ref _running) == 1;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Archive folder: config DocumentArchive:Directory (prod: outside the site, e.g. C:\gndj-backups\documents,
    // synced off-server by backup-db.ps1), else <cwd>/archives/documents. Never served by the website.
    private string ArchiveDir()
    {
        var dir = config["DocumentArchive:Directory"];
        return Path.GetFullPath(string.IsNullOrWhiteSpace(dir) ? Path.Combine(Directory.GetCurrentDirectory(), "archives", "documents") : dir);
    }

    public string? ResolveArchive(string fileName)
    {
        var dir = ArchiveDir();
        var full = Path.GetFullPath(Path.Combine(dir, Path.GetFileName(fileName)));
        return full.StartsWith(dir, StringComparison.OrdinalIgnoreCase) && File.Exists(full) ? full : null;
    }

    // ── settings helpers ──
    private static async Task<string?> Setting(GndjDbContext ctx, string key, CancellationToken ct)
        => await ctx.Settings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(ct);

    private static async Task SetSetting(GndjDbContext ctx, string key, string value, CancellationToken ct)
    {
        var s = await ctx.Settings.FirstOrDefaultAsync(x => x.Key == key, ct);
        if (s is null) ctx.Settings.Add(new Setting { Key = key, Value = value, Category = "passage", Label = key, ValueType = "string" });
        else s.Value = value;
    }

    private static List<string> ParseList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; } catch { return []; }
    }

    private sealed record Plan(
        string ScoutYear, bool KeepApproval, List<Guid> KeptTypeIds, List<string> KeptTypeNames,
        Dictionary<Guid, string> PromoteTo, int NewMembersSkipped);

    // Everything the run needs to decide, computed from the current data + settings (also drives the preview).
    private static async Task<Plan> BuildPlanAsync(GndjDbContext ctx, CancellationToken ct)
    {
        var year = await Setting(ctx, "passage.scout_year", ct) ?? "";
        var keepCodes = ParseList(await Setting(ctx, NewYearKeys.KeepDocumentTypes, ct)).Select(c => c.Trim().ToUpperInvariant()).ToHashSet();
        var keepApproval = !string.Equals(await Setting(ctx, NewYearKeys.KeepIdApproval, ct), "false", StringComparison.OrdinalIgnoreCase);
        var keptTypes = await ctx.DocumentTypes.IgnoreQueryFilters()
            .Where(t => keepCodes.Contains(t.Code.ToUpper())).Select(t => new { t.Id, t.Name }).ToListAsync(ct);

        // Classe promotion: active members whose classe is in the managed list (not the last entry).
        var classes = ParseList(await Setting(ctx, "member.classes", ct));
        var next = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < classes.Count - 1; i++) next[classes[i]] = classes[i + 1];
        // Members just created from THIS year's demandes were enrolled with the new year's classe — don't push them.
        var newFromDemandes = await ctx.Demandes.Where(d => d.ScoutYear == year && d.CreatedMemberId != null)
            .Select(d => d.CreatedMemberId!.Value).ToListAsync(ct);
        var newSet = newFromDemandes.ToHashSet();
        var candidates = await ctx.Members
            .Where(m => m.Classe != null && m.Classe != "" && m.Assignments.Any(a => a.EndDate == null && !a.IsDeleted))
            .Select(m => new { m.Id, m.Classe }).ToListAsync(ct);
        var promote = new Dictionary<Guid, string>();
        var skipped = 0;
        foreach (var c in candidates)
        {
            if (!next.TryGetValue(c.Classe!.Trim(), out var to)) continue;
            if (newSet.Contains(c.Id)) { skipped++; continue; }
            promote[c.Id] = to;
        }
        return new Plan(year, keepApproval, keptTypes.Select(t => t.Id).ToList(), keptTypes.Select(t => t.Name).ToList(), promote, skipped);
    }

    public async Task<NewYearPreviewDto> PreviewAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
        var plan = await BuildPlanAsync(ctx, ct);
        var toDelete = ctx.MemberDocuments.Where(d => !plan.KeptTypeIds.Contains(d.DocumentTypeId));
        var delCount = await toDelete.CountAsync(ct);
        var delBytes = await toDelete.SumAsync(d => (long?)d.FileSize, ct) ?? 0;
        delBytes += await ctx.MemberDocumentPages.Where(p => !plan.KeptTypeIds.Contains(p.MemberDocument.DocumentTypeId) && !p.MemberDocument.IsDeleted)
            .SumAsync(p => (long?)p.FileSize, ct) ?? 0;
        var kept = await ctx.MemberDocuments.CountAsync(d => plan.KeptTypeIds.Contains(d.DocumentTypeId), ct);
        var approvals = plan.KeepApproval ? 0
            : await ctx.MemberDocuments.CountAsync(d => plan.KeptTypeIds.Contains(d.DocumentTypeId) && d.Status != DocumentStatus.Pending, ct);
        var sections = await ctx.Members.CountAsync(m => m.Section != null && m.Section != "", ct);
        return new NewYearPreviewDto(plan.ScoutYear, delCount, delBytes, kept, approvals, sections,
            plan.PromoteTo.Count, plan.NewMembersSkipped, plan.KeptTypeNames, plan.KeepApproval);
    }

    public async Task<NewYearRunStatus?> GetLastRunAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var raw = await Setting(scope.ServiceProvider.GetRequiredService<GndjDbContext>(), NewYearKeys.Status, ct);
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            var st = JsonSerializer.Deserialize<NewYearRunStatus>(raw, Json);
            // A "running" status with no live task = the app restarted mid-run (nothing was committed) → failed.
            if (st is { State: "running" } && !IsRunning) st = st with { State = "failed", Error = "Interrompu (redémarrage du serveur). Relancez le nettoyage." };
            return st;
        }
        catch { return null; }
    }

    public async Task<string?> GetDoneForAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        return await Setting(scope.ServiceProvider.GetRequiredService<GndjDbContext>(), NewYearKeys.DoneFor, ct);
    }

    public async Task<Result<bool>> StartAsync(Guid? userId, string? userLabel, CancellationToken ct)
    {
        string year; string? who;
        using (var scope = scopes.CreateScope())
        {
            var ctx = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
            year = await Setting(ctx, "passage.scout_year", ct) ?? "";
            if (string.IsNullOrWhiteSpace(year)) return Result<bool>.Failure("L'année scoute n'est pas définie (Paramètres → Passage).");
            if (await Setting(ctx, NewYearKeys.DoneFor, ct) == year)
                return Result<bool>.Failure($"Le nettoyage a déjà été fait pour l'année {year}.");
            who = userLabel ?? (userId is Guid uid
                ? await ctx.Users.Where(u => u.Id == uid).Select(u => u.Member.FirstName + " " + u.Member.LastName).FirstOrDefaultAsync(ct)
                : null);
        }
        if (Interlocked.CompareExchange(ref _running, 1, 0) != 0) return Result<bool>.Failure("Un nettoyage est déjà en cours.");
        // Detached from the request: CancellationToken.None so the run isn't aborted when the HTTP call returns.
        _ = Task.Run(() => RunAsync(year, who, userId));
        return Result<bool>.Success(true);
    }

    private async Task RunAsync(string year, string? who, Guid? userId)
    {
        var status = new NewYearRunStatus("running", year, "Export des documents", DateTime.UtcNow, null, null,
            null, null, null, null, null, null, null, null, who);
        try
        {
            await SaveStatusAsync(status);
            using var scope = scopes.CreateScope();
            var ctx = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
            var plan = await BuildPlanAsync(ctx, CancellationToken.None);
            var cwd = Path.GetFullPath(Directory.GetCurrentDirectory());
            var uploadsRoot = Path.GetFullPath(Path.Combine(cwd, "uploads"));

            // ── 1. Export every (non-deleted) document + its pages to a zip: <unité>/<NOM Prénom>/<type>[ - pN].ext ──
            var docs = await ctx.MemberDocuments
                .Select(d => new
                {
                    d.Id, d.FilePath, d.FileName, d.DocumentTypeId, Type = d.DocumentType.Name,
                    Member = d.Member.LastName + " " + d.Member.FirstName,
                    Unit = d.Member.Assignments.Where(a => a.EndDate == null && !a.IsDeleted).Select(a => a.Unit.Name).FirstOrDefault(),
                    Pages = d.Pages.OrderBy(p => p.PageOrder).Select(p => new { p.FilePath, p.FileName, p.PageOrder }).ToList(),
                })
                .ToListAsync();
            var dir = ArchiveDir();
            Directory.CreateDirectory(dir);
            var safeYear = string.Concat(year.Where(ch => char.IsLetterOrDigit(ch) || ch == '-'));
            var zipName = $"documents_{safeYear}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
            var zipPath = Path.Combine(dir, zipName);
            int exported = 0, missing = 0;
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using (var fs = new FileStream(zipPath, FileMode.CreateNew, FileAccess.Write))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                void Add(string stored, string entryBase, string originalName)
                {
                    var full = Path.GetFullPath(Path.Combine(cwd, stored.Replace('\\', '/').TrimStart('/')));
                    if (!full.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) { missing++; return; }
                    var entry = entryBase + Path.GetExtension(originalName is { Length: > 0 } ? originalName : full);
                    for (var n = 2; !used.Add(entry); n++) entry = $"{entryBase} ({n}){Path.GetExtension(full)}";
                    // Documents are already-compressed PDF/JPG/PNG: store them as-is (fast, no CPU burn on a big run).
                    zip.CreateEntryFromFile(full, entry, CompressionLevel.NoCompression);
                    exported++;
                }
                foreach (var d in docs)
                {
                    var folder = $"{Safe(d.Unit ?? "Sans unité")}/{Safe(d.Member)}";
                    var baseName = $"{folder}/{Safe(d.Type)}";
                    Add(d.FilePath, d.Pages.Count > 0 ? baseName + " - p1" : baseName, d.FileName);
                    foreach (var p in d.Pages) Add(p.FilePath, $"{baseName} - p{p.PageOrder}", p.FileName);
                }
            }
            var zipBytes = new FileInfo(zipPath).Length;
            status = status with { Phase = "Mise à jour de la base", Exported = exported, MissingFiles = missing, ArchiveFile = zipName, ArchiveBytes = zipBytes };
            await SaveStatusAsync(status);

            // ── 2. All database changes + the "done" marker in ONE transaction ──
            var kept = plan.KeptTypeIds;
            var delDocs = await ctx.MemberDocuments.IgnoreQueryFilters().Where(d => !kept.Contains(d.DocumentTypeId))
                .Select(d => new { d.Id, d.FilePath }).ToListAsync();
            var delIds = delDocs.Select(d => d.Id).ToList();
            var delPaths = delDocs.Select(d => d.FilePath).ToList();
            delPaths.AddRange(await ctx.MemberDocumentPages.Where(p => delIds.Contains(p.MemberDocumentId)).Select(p => p.FilePath).ToListAsync());

            int approvalsReset = 0, sectionsCleared, promoted = 0;
            await using (var tx = await ctx.Database.BeginTransactionAsync())
            {
                // Chunked so a large year never builds one giant IN (...) list.
                foreach (var chunk in delIds.Chunk(1000))
                {
                    await ctx.MemberDocumentPages.Where(p => chunk.Contains(p.MemberDocumentId)).ExecuteDeleteAsync();
                    await ctx.MemberDocuments.IgnoreQueryFilters().Where(d => chunk.Contains(d.Id)).ExecuteDeleteAsync();
                }
                if (!plan.KeepApproval)
                    approvalsReset = await ctx.MemberDocuments.Where(d => kept.Contains(d.DocumentTypeId) && d.Status != DocumentStatus.Pending)
                        .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, DocumentStatus.Pending)
                            .SetProperty(d => d.ReviewedBy, (Guid?)null).SetProperty(d => d.ReviewedAt, (DateTime?)null)
                            .SetProperty(d => d.ReviewNotes, (string?)null));
                sectionsCleared = await ctx.Members.IgnoreQueryFilters().Where(m => m.Section != null && m.Section != "")
                    .ExecuteUpdateAsync(s => s.SetProperty(m => m.Section, (string?)null));
                // One UPDATE per target classe, on the ids decided up front (so nobody moves twice).
                foreach (var g in plan.PromoteTo.GroupBy(kv => kv.Value))
                {
                    var ids = g.Select(kv => kv.Key).ToList();
                    promoted += await ctx.Members.Where(m => ids.Contains(m.Id)).ExecuteUpdateAsync(s => s.SetProperty(m => m.Classe, g.Key));
                }
                status = status with { State = "done", Phase = null, FinishedAt = DateTime.UtcNow, Deleted = delIds.Count,
                    ApprovalsReset = approvalsReset, SectionsCleared = sectionsCleared, ClassesPromoted = promoted };
                await SetSetting(ctx, NewYearKeys.DoneFor, year, CancellationToken.None);
                await SetSetting(ctx, NewYearKeys.Status, JsonSerializer.Serialize(status, Json), CancellationToken.None);
                await ctx.SaveChangesAsync();
                await tx.CommitAsync();
            }

            // ── 3. Files of the deleted documents (after the commit; best-effort) ──
            foreach (var p in delPaths.Where(p => !string.IsNullOrWhiteSpace(p)))
            {
                try
                {
                    var full = Path.GetFullPath(Path.Combine(cwd, p.Replace('\\', '/').TrimStart('/')));
                    if (full.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase) && File.Exists(full)) File.Delete(full);
                }
                catch (Exception ex) { logger.LogWarning(ex, "New-year cleanup: could not delete {Path}", p); }
            }

            try
            {
                var audit = scope.ServiceProvider.GetRequiredService<IAuditService>();
                await audit.LogAsync("NettoyageNouvelleAnnee", "ScoutYear", null, newValues: new
                {
                    Year = year, LancePar = who, Exportes = exported, FichiersManquants = missing, Archive = zipName,
                    DocumentsSupprimes = delIds.Count, ValidationsReinitialisees = approvalsReset, SectionsVidees = sectionsCleared,
                    ClassesAvancees = promoted, TypesConserves = string.Join(", ", plan.KeptTypeNames),
                });
            }
            catch (Exception ex) { logger.LogWarning(ex, "New-year cleanup: audit log failed"); }
            logger.LogInformation("New-year cleanup {Year} done: exported {Exported}, deleted {Deleted}, promoted {Promoted}", year, exported, delIds.Count, promoted);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "New-year cleanup {Year} failed", year);
            await SaveStatusAsync(status with { State = "failed", FinishedAt = DateTime.UtcNow, Error = ex.Message });
        }
        finally { Interlocked.Exchange(ref _running, 0); }
    }

    private async Task SaveStatusAsync(NewYearRunStatus st)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var ctx = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
            await SetSetting(ctx, NewYearKeys.Status, JsonSerializer.Serialize(st, Json), CancellationToken.None);
            await ctx.SaveChangesAsync();
        }
        catch (Exception ex) { logger.LogWarning(ex, "New-year cleanup: could not save status"); }
    }

    // Folder/file-name safe text for zip entries (no path separators or reserved characters).
    private static string Safe(string s)
    {
        var bad = Path.GetInvalidFileNameChars().Concat(['/', '\\', ':']).ToHashSet();
        var clean = new string(s.Select(ch => bad.Contains(ch) ? '_' : ch).ToArray()).Trim().TrimEnd('.');
        return clean.Length == 0 ? "_" : clean;
    }
}
