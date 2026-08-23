using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// Shared logic for the two campaign steps (send error emails / put incomplete dossiers on hold), so the daily
// background job AND the CG's manual buttons run EXACTLY the same code. All methods take the DbContext + email
// queue so they work with or without a signed-in user (the background job has none). "Verification done" for a
// phase = there are ZERO documents still awaiting review across the group (nothing left Pending).

public record CampaignSendReport(int Sent, int NoEmail);
public record CampaignHoldReport(int Held, int Emailed, int NoEmail);
public record UnitPending(Guid UnitId, string UnitName, int PendingCount, int IncompleteCount);

public static class DocumentCampaignActions
{
    // Active (member → unit) rows across the group (a member may appear once per active unit).
    private static async Task<List<(Guid MemberId, string FirstName, string LastName, Guid UnitId, string UnitName)>>
        ActiveMembersAsync(IApplicationDbContext ctx, CancellationToken ct) =>
        (await ctx.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, a.UnitId, UnitName = a.Unit.Name })
            .ToListAsync(ct))
        .Select(a => (a.MemberId, a.FirstName, a.LastName, a.UnitId, a.UnitName)).ToList();

    private static async Task<List<(Guid Id, string Name, string Code)>> ActiveTypesAsync(IApplicationDbContext ctx, CancellationToken ct) =>
        (await ctx.DocumentTypes.Where(dt => dt.IsActive).OrderBy(dt => dt.DisplayOrder).ThenBy(dt => dt.Name)
            .Select(dt => new { dt.Id, dt.Name, dt.Code }).ToListAsync(ct))
        .Select(t => (t.Id, t.Name, t.Code)).ToList();

    // A member's gaps, keyed by member, over all active members. Empty gaps = compliant (excluded).
    internal sealed record IncompleteMember(Guid MemberId, string Name, string UnitName, List<DocGapDto> Gaps);

    internal static async Task<List<IncompleteMember>> LoadIncompleteAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var activeTypes = await ActiveTypesAsync(ctx, ct);
        if (activeTypes.Count == 0) return [];
        var typeIds = activeTypes.Select(t => t.Id).ToList();

        var actives = await ActiveMembersAsync(ctx, ct);
        var memberIds = actives.Select(a => a.MemberId).Distinct().ToList();
        if (memberIds.Count == 0) return [];

        var docs = await ctx.MemberDocuments
            .Where(d => memberIds.Contains(d.MemberId) && typeIds.Contains(d.DocumentTypeId))
            .Select(d => new { d.MemberId, d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt })
            .ToListAsync(ct);
        var docsByMember = docs.GroupBy(d => d.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(d => new DocumentGaps.DocFacts(d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt)).ToList());

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var firstUnitByMember = actives.GroupBy(a => a.MemberId).ToDictionary(g => g.Key, g => g.First());

        var result = new List<IncompleteMember>();
        foreach (var memberId in memberIds)
        {
            var memberDocs = docsByMember.TryGetValue(memberId, out var d) ? d : [];
            var gaps = DocumentGaps.Compute(activeTypes, memberDocs, today);
            if (gaps.Count == 0) continue;
            var mm = firstUnitByMember[memberId];
            result.Add(new IncompleteMember(memberId, $"{mm.FirstName} {mm.LastName}".Trim(), mm.UnitName, gaps));
        }
        return result;
    }

    // Per-unit pending (docs awaiting review) + incomplete counts — drives the CG dashboard + alert.
    public static async Task<List<UnitPending>> PendingByUnitAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var actives = await ActiveMembersAsync(ctx, ct);
        var memberIds = actives.Select(a => a.MemberId).Distinct().ToList();
        var activeTypes = await ActiveTypesAsync(ctx, ct);
        var typeIds = activeTypes.Select(t => t.Id).ToList();

        var pendingMemberIds = memberIds.Count == 0 || typeIds.Count == 0
            ? new HashSet<Guid>()
            : (await ctx.MemberDocuments
                .Where(d => memberIds.Contains(d.MemberId) && typeIds.Contains(d.DocumentTypeId) && d.Status == DocumentStatus.Pending)
                .Select(d => d.MemberId).Distinct().ToListAsync(ct)).ToHashSet();

        var incompleteIds = (await LoadIncompleteAsync(ctx, ct)).Select(m => m.MemberId).ToHashSet();

        return actives
            .GroupBy(a => new { a.UnitId, a.UnitName })
            .Select(g => new UnitPending(g.Key.UnitId, g.Key.UnitName,
                g.Select(x => x.MemberId).Distinct().Count(id => pendingMemberIds.Contains(id)),
                g.Select(x => x.MemberId).Distinct().Count(id => incompleteIds.Contains(id))))
            .Where(u => u.PendingCount > 0 || u.IncompleteCount > 0)
            .OrderByDescending(u => u.PendingCount).ThenByDescending(u => u.IncompleteCount).ThenBy(u => u.UnitName)
            .ToList();
    }

    // Verification "done" for a phase = no documents left awaiting review across the whole group.
    public static async Task<int> PendingReviewCountAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var actives = await ActiveMembersAsync(ctx, ct);
        var memberIds = actives.Select(a => a.MemberId).Distinct().ToList();
        var typeIds = (await ActiveTypesAsync(ctx, ct)).Select(t => t.Id).ToList();
        if (memberIds.Count == 0 || typeIds.Count == 0) return 0;
        return await ctx.MemberDocuments.CountAsync(
            d => memberIds.Contains(d.MemberId) && typeIds.Contains(d.DocumentTypeId) && d.Status == DocumentStatus.Pending, ct);
    }

    // ── Step 1: email every incomplete member their gap list (reuses the document_reminder template) ──
    public static async Task<CampaignSendReport> RunSendErrorsAsync(
        IApplicationDbContext ctx, IEmailQueue emailQueue, string? scoutYear, CancellationToken ct)
    {
        var incomplete = await LoadIncompleteAsync(ctx, ct);
        var report = await SendGapEmailsAsync(ctx, emailQueue, incomplete, ct);
        await SetMarkerAsync(ctx, DocumentCampaignKeys.ErrorsSentFor, scoutYear, ct);
        return report;
    }

    private static async Task<CampaignSendReport> SendGapEmailsAsync(
        IApplicationDbContext ctx, IEmailQueue emailQueue, List<IncompleteMember> incomplete, CancellationToken ct)
    {
        if (incomplete.Count == 0) return new CampaignSendReport(0, 0);
        var ids = incomplete.Select(m => m.MemberId).ToList();
        var resolver = await ContactEmailResolver.LoadAsync(ctx, ids, ct);
        var primaryByMember = await ctx.Members.Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.PrimaryContactEmail }).ToDictionaryAsync(m => m.Id, m => m.PrimaryContactEmail, ct);
        var documentsUrl = $"{await BaseUrlAsync(ctx, ct)}/my-documents";

        int sent = 0, noEmail = 0;
        var jobs = new List<EmailJob>();
        foreach (var m in incomplete)
        {
            primaryByMember.TryGetValue(m.MemberId, out var primary);
            var email = resolver.Resolve(m.MemberId, primary);
            if (string.IsNullOrWhiteSpace(email)) { noEmail++; continue; }
            var list = string.Join("\n", m.Gaps.Select(g => $"• {g.DocTypeName} — {DocumentGaps.FrenchReason(g.Reason)}"));
            jobs.Add(new EmailJob("document_reminder", email!, new Dictionary<string, string>
            {
                ["memberName"] = m.Name, ["unitName"] = m.UnitName, ["documentsList"] = list, ["documentsUrl"] = documentsUrl,
            }));
            sent++;
        }
        await emailQueue.EnqueueManyAsync(jobs, ct);
        return new CampaignSendReport(sent, noEmail);
    }

    // ── Step 2: put every still-incomplete member on hold + email them ──
    public static async Task<CampaignHoldReport> RunApplyHoldAsync(
        IApplicationDbContext ctx, IEmailQueue emailQueue, string? scoutYear, CancellationToken ct)
    {
        var incomplete = await LoadIncompleteAsync(ctx, ct);
        if (incomplete.Count == 0) { await SetMarkerAsync(ctx, DocumentCampaignKeys.HoldAppliedFor, scoutYear, ct); return new CampaignHoldReport(0, 0, 0); }

        var ids = incomplete.Select(m => m.MemberId).ToList();
        var now = DateTime.UtcNow;
        // Flag the members (only those not already on hold).
        var members = await ctx.Members.Where(m => ids.Contains(m.Id) && !m.IsOnHold).ToListAsync(ct);
        foreach (var m in members) { m.IsOnHold = true; m.OnHoldAt = now; }
        await ctx.SaveChangesAsync(ct);

        // Email each incomplete member.
        var resolver = await ContactEmailResolver.LoadAsync(ctx, ids, ct);
        var primaryByMember = await ctx.Members.Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.PrimaryContactEmail }).ToDictionaryAsync(m => m.Id, m => m.PrimaryContactEmail, ct);
        int emailed = 0, noEmail = 0;
        var jobs = new List<EmailJob>();
        foreach (var m in incomplete)
        {
            primaryByMember.TryGetValue(m.MemberId, out var primary);
            var email = resolver.Resolve(m.MemberId, primary);
            if (string.IsNullOrWhiteSpace(email)) { noEmail++; continue; }
            jobs.Add(new EmailJob("membership_on_hold", email!, new Dictionary<string, string>
            {
                ["memberName"] = m.Name, ["unitName"] = m.UnitName,
            }));
            emailed++;
        }
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await SetMarkerAsync(ctx, DocumentCampaignKeys.HoldAppliedFor, scoutYear, ct);
        return new CampaignHoldReport(incomplete.Count, emailed, noEmail);
    }

    // ── CG alert: verification not finished at the transition date ──
    public static async Task<int> SendCgAlertAsync(
        IApplicationDbContext ctx, IEmailQueue emailQueue, string phaseLabel, List<UnitPending> pendingByUnit, CancellationToken ct)
    {
        var emails = await GroupManagerEmailsAsync(ctx, ct);
        if (emails.Count == 0) return 0;
        var unitsList = string.Join("\n", pendingByUnit.Where(u => u.PendingCount > 0)
            .Select(u => $"• {u.UnitName} — {u.PendingCount} document(s) à vérifier"));
        var appUrl = $"{await BaseUrlAsync(ctx, ct)}/admin/document-verification";
        var jobs = emails.Select(e => new EmailJob("document_verification_incomplete", e, new Dictionary<string, string>
        {
            ["phase"] = phaseLabel, ["unitsList"] = string.IsNullOrWhiteSpace(unitsList) ? "—" : unitsList, ["appUrl"] = appUrl,
        })).ToList();
        await emailQueue.EnqueueManyAsync(jobs, ct);
        return emails.Count;
    }

    // Contact emails of the group managers (CG/ACG = group-level role) + super-admins, deduped.
    private static async Task<List<string>> GroupManagerEmailsAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var cgIds = await ctx.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.IsGroupLevel)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var adminIds = await ctx.Users.Where(u => u.IsSuperAdmin && !u.IsDeleted && u.MemberId != Guid.Empty)
            .Select(u => u.MemberId).ToListAsync(ct);
        var ids = cgIds.Concat(adminIds).Distinct().ToList();
        if (ids.Count == 0) return [];
        var resolver = await ContactEmailResolver.LoadAsync(ctx, ids, ct);
        var primaryByMember = await ctx.Members.Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.PrimaryContactEmail }).ToDictionaryAsync(m => m.Id, m => m.PrimaryContactEmail, ct);
        return ids
            .Select(id => { primaryByMember.TryGetValue(id, out var p); return resolver.Resolve(id, p); })
            .Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e!).Distinct().ToList();
    }

    private static async Task<string> BaseUrlAsync(IApplicationDbContext ctx, CancellationToken ct) =>
        ((await ctx.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');

    // Upsert a marker setting (idempotency stamp) so the automated step fires once per campaign.
    public static async Task SetMarkerAsync(IApplicationDbContext ctx, string key, string? value, CancellationToken ct)
    {
        var entity = await ctx.Settings.FindAsync([key], ct);
        if (entity is null)
            ctx.Settings.Add(new Domain.Entities.Setting { Key = key, Value = value ?? "", Category = "documents", Label = key, Description = "Marqueur interne de campagne documents", ValueType = "string" });
        else
            entity.Value = value ?? "";
        await ctx.SaveChangesAsync(ct);
    }

    public static async Task<string?> GetSettingAsync(IApplicationDbContext ctx, string key, CancellationToken ct) =>
        await ctx.Settings.Where(s => s.Key == key).Select(s => s.Value).FirstOrDefaultAsync(ct);
}
