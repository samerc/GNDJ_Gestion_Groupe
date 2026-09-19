using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GNDJ.Application.AuditLogs;

// Automatic "archive & clear" of the audit trail when a new scout year is created (i.e. passage.scout_year
// rolls FORWARD — see UpdateSettingCommandHandler). The retention model chosen by the group: keep ~12 months,
// and at each new year EXPORT the whole log, DELETE it, and EMAIL it to admin + CG.
//
// SAFETY (irreversible delete): the CSV is written to a durable, NON-web-served archive folder BEFORE anything
// is deleted (SaveAsync throws → we abort and delete nothing). Then the delete + a surviving "ArchiveAnnuelle"
// marker row + the idempotency marker are committed in one transaction. The email is best-effort AFTER the
// commit (the archive already exists on disk + off-server, so a mail hiccup never loses the year). Idempotent:
// audit.last_archived_year is advanced so a retry / a re-set of the same year never re-archives.
internal static class AuditYearArchive
{
    public const string MarkerKey = "audit.last_archived_year";
    private const long MaxAttachBytes = 15L * 1024 * 1024; // don't attach a CSV bigger than ~15 MB (provider limits)

    // closingYearLabel = the year being CLOSED (the previous passage.scout_year), used to name the file/email;
    // newYear = the year now starting (stored in the idempotency marker).
    public static async Task RunAsync(
        IApplicationDbContext ctx, IEmailQueue emailQueue, IAuditService audit, IAuditArchiveStorage storage,
        string? closingYearLabel, string newYear, ILogger logger, CancellationToken ct)
    {
        var label = string.IsNullOrWhiteSpace(closingYearLabel) ? LebanonClock.Today.Year.ToString() : closingYearLabel.Trim();

        var count = await ctx.AuditLogs.CountAsync(ct);
        if (count == 0)
        {
            // Nothing to archive — just advance the marker so we don't keep re-checking this year.
            await SetMarkerAsync(ctx, newYear, ct);
            await ctx.SaveChangesAsync(ct);
            return;
        }

        // 1) Build the CSV of the WHOLE trail (newest first, full before/after JSON).
        var csv = await AuditCsv.BuildAsync(ctx.AuditLogs, ct);

        // 2) Persist it durably BEFORE deleting (throws → caller aborts; nothing deleted). Timestamped name so a
        //    same-year re-archive never overwrites the previous file.
        var fileName = $"journal-audit-{Sanitize(label)}-{LebanonClock.Now:yyyyMMddHHmmss}.csv";
        var storedPath = await storage.SaveAsync(fileName, csv, ct);

        // 3) Resolve the recipients (admin = super-admins, CG = group-level role holders) to contact emails.
        var recipients = await ResolveRecipientsAsync(ctx, ct);

        // 4) Delete the trail + write the surviving marker row + advance the idempotency marker, atomically.
        int deleted;
        await using (var tx = await ctx.BeginTransactionAsync(ct))
        {
            deleted = await ctx.AuditLogs.ExecuteDeleteAsync(ct);
            await SetMarkerAsync(ctx, newYear, ct); // tracked; flushed by the LogAsync SaveChanges below
            // The "ArchiveAnnuelle" row is inserted AFTER the delete, so it survives (like the manual Purge row).
            await audit.LogAsync("ArchiveAnnuelle", "AuditLog", null,
                newValues: new { Year = label, Count = deleted, File = fileName }, cancellationToken: ct);
            await tx.CommitAsync(ct);
        }

        // 5) Email the archive to admin + CG (best-effort, via the durable outbox → honours the test override +
        //    provider routing). Attach the CSV unless it's too big for email; the off-server copy exists regardless.
        if (recipients.Count == 0)
        {
            logger.LogWarning("Audit year archive {Year}: {Count} entries archived to {Path}, but no admin/CG " +
                "recipient email could be resolved — email skipped.", label, deleted, storedPath);
            return;
        }

        var attach = csv.LongLength <= MaxAttachBytes;
        var vars = new Dictionary<string, string>
        {
            ["year"] = label,
            ["count"] = deleted.ToString(),
            ["date"] = LebanonClock.Today.ToString("yyyy-MM-dd"),
            ["note"] = attach
                ? "Le fichier CSV complet du journal est joint à cet email."
                : "Le journal était trop volumineux pour être joint à l'email ; une copie a été conservée hors-serveur.",
        };
        var attachments = attach ? new List<EmailAttachment> { new(fileName, storedPath) } : null;
        var jobs = recipients.Select(r => new EmailJob("audit_year_archive", r, vars, attachments));
        await emailQueue.EnqueueManyAsync(jobs, ct);
    }

    // Recipients = super-admins (admin) + active group-level role holders (CG/ACG), resolved to their best
    // contact email (PrimaryContactEmail → own → guardian), deduped case-insensitively.
    private static async Task<List<string>> ResolveRecipientsAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var superAdmins = await ctx.Users.Where(u => u.IsSuperAdmin && u.IsActive)
            .Select(u => u.MemberId).ToListAsync(ct);
        var groupLevel = await ctx.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.IsGroupLevel)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var ids = superAdmins.Concat(groupLevel).Distinct().ToList();
        if (ids.Count == 0) return [];

        var primary = (await ctx.Members.Where(m => ids.Contains(m.Id))
                .Select(m => new { m.Id, m.PrimaryContactEmail }).ToListAsync(ct))
            .ToDictionary(m => m.Id, m => m.PrimaryContactEmail);

        var resolver = await ContactEmailResolver.LoadAsync(ctx, ids, ct);
        var emails = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in ids)
        {
            var email = resolver.Resolve(id, primary.GetValueOrDefault(id));
            if (!string.IsNullOrWhiteSpace(email) && seen.Add(email.Trim()))
                emails.Add(email.Trim());
        }
        return emails;
    }

    // Upsert the idempotency marker setting (created hidden the first time). Tracked only — the caller's
    // SaveChanges (inside the transaction) flushes it.
    private static async Task SetMarkerAsync(IApplicationDbContext ctx, string newYear, CancellationToken ct)
    {
        var marker = await ctx.Settings.FirstOrDefaultAsync(s => s.Key == MarkerKey, ct);
        if (marker is null)
            ctx.Settings.Add(new Setting
            {
                Key = MarkerKey,
                Value = newYear,
                ValueType = "string",
                Category = "maintenance",
                Label = "Dernière année d'audit archivée",
                Description = "Marqueur interne : la dernière année scoute dont le journal d'audit a été archivé et vidé automatiquement.",
            });
        else
            marker.Value = newYear;
    }

    private static string Sanitize(string s) => string.Concat(s.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_'));
}
