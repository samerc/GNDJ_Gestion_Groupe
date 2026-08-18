using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// "Relance documents" — after the submission + CU-verification window, email the members whose dossier is
// still incomplete a personalized list of exactly what's missing / to correct / to renew. Same shape as
// "Envoyer les accès": pick a unit → preview the non-compliant members + their gaps → send ONE email per
// member (to the resolved contact email) via the durable outbox → get a sent / no-email report.
//
// "Required" = every ACTIVE document type (the CU compliance matrix already treats all active types as
// expected — there's no per-type is_required flag). A gap for a member+type is one of:
//   - missing  : no document of that type at all
//   - rejected : the latest document was refused (wrong paper → "à corriger")
//   - expired  : the latest document is Approved but past its expiry ("à renouveler")
// A Pending document (uploaded, awaiting the CU) is NOT nagged — it's the CU's turn, not the member's.
// Members whose dossier is complete (every active type Approved & not expired, or only Pending) are skipped.

// Reason keys are stable ("missing" | "rejected" | "expired"); the email builder + frontend map them to French.
// DocTypeCode is the short code (e.g. "AP", "FM") — the admin table shows it (compact for 6-7 docs); the email
// keeps the full DocTypeName so parents understand which document.
public record DocGapDto(string DocTypeName, string DocTypeCode, string Reason);
public record DocReminderCandidateDto(
    Guid MemberId, string MemberName, string? TeamName, IReadOnlyList<DocGapDto> Gaps, bool HasEmail, string? ContactEmail);

// Shared gap computation, reused by the preview query and the send command so they can never diverge.
internal static class DocumentGaps
{
    // A slim view of one member's documents keyed by type (latest per type). Status/ExpiryDate drive the gap.
    internal sealed record DocFacts(Guid DocumentTypeId, string Status, DateOnly? ExpiryDate, DateTime CreatedAt);

    // Given the active doc types (id → name/code) and a member's documents, return the member's gaps (empty = compliant).
    public static List<DocGapDto> Compute(
        IReadOnlyList<(Guid Id, string Name, string Code)> activeTypes, IReadOnlyList<DocFacts> memberDocs, DateOnly today)
    {
        var gaps = new List<DocGapDto>();
        foreach (var (typeId, typeName, typeCode) in activeTypes)
        {
            // Most recently uploaded document of this type is the one that counts (mirrors the CU matrix cell).
            var doc = memberDocs.Where(d => d.DocumentTypeId == typeId)
                .OrderByDescending(d => d.CreatedAt).FirstOrDefault();

            if (doc is null)
                gaps.Add(new DocGapDto(typeName, typeCode, "missing"));
            else if (doc.Status == DocumentStatus.Rejected)
                gaps.Add(new DocGapDto(typeName, typeCode, "rejected"));
            else if (doc.Status == DocumentStatus.Approved && doc.ExpiryDate is { } exp && exp < today)
                gaps.Add(new DocGapDto(typeName, typeCode, "expired"));
            // Approved & not expired → OK; Pending → awaiting the CU, not a member-facing gap.
        }
        return gaps;
    }

    // French label for a reason key, used in the email body list.
    public static string FrenchReason(string reason) => reason switch
    {
        "missing" => "manquant",
        "rejected" => "à corriger",
        "expired" => "à renouveler",
        _ => reason
    };
}

// ── Overview: every unit that has incomplete dossiers + how many (the CG one-click worklist) ──
public record UnitReminderSummaryDto(Guid UnitId, string UnitName, int IncompleteCount, int WithEmailCount);
public record GetDocumentReminderSummaryQuery() : IRequest<Result<IReadOnlyList<UnitReminderSummaryDto>>>;

public class GetDocumentReminderSummaryQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDocumentReminderSummaryQuery, Result<IReadOnlyList<UnitReminderSummaryDto>>>
{
    public async ValueTask<Result<IReadOnlyList<UnitReminderSummaryDto>>> Handle(GetDocumentReminderSummaryQuery request, CancellationToken ct)
    {
        // CG-level: a group manager sees every unit's incomplete count in one pass (super-admin OR maitrise.manage).
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<UnitReminderSummaryDto>>.Failure("Accès réservé au Chef de Groupe.");

        var activeTypes = await context.DocumentTypes
            .Where(dt => dt.IsActive).Select(dt => new { dt.Id, dt.Name, dt.Code }).ToListAsync(ct);
        if (activeTypes.Count == 0)
            return Result<IReadOnlyList<UnitReminderSummaryDto>>.Success(new List<UnitReminderSummaryDto>());
        var typeList = activeTypes.Select(t => (t.Id, t.Name, t.Code)).ToList();
        var typeIds = typeList.Select(t => t.Id).ToList();

        // Every active (member, unit) across the group + the unit name.
        var assignments = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.UnitId, UnitName = a.Unit.Name })
            .ToListAsync(ct);
        var memberIds = assignments.Select(a => a.MemberId).Distinct().ToList();
        if (memberIds.Count == 0)
            return Result<IReadOnlyList<UnitReminderSummaryDto>>.Success(new List<UnitReminderSummaryDto>());

        var docs = await context.MemberDocuments
            .Where(d => memberIds.Contains(d.MemberId) && typeIds.Contains(d.DocumentTypeId))
            .Select(d => new { d.MemberId, d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt })
            .ToListAsync(ct);
        var docsByMember = docs.GroupBy(d => d.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(d => new DocumentGaps.DocFacts(d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt)).ToList());

        var resolver = await ContactEmailResolver.LoadAsync(context, memberIds, ct);
        var primaryByMember = await context.Members
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.PrimaryContactEmail })
            .ToDictionaryAsync(m => m.Id, m => m.PrimaryContactEmail, ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Which members are incomplete (gaps > 0) + whether they have a contact email — computed once per member.
        var incomplete = new HashSet<Guid>();
        var incompleteWithEmail = new HashSet<Guid>();
        foreach (var memberId in memberIds)
        {
            var memberDocs = docsByMember.TryGetValue(memberId, out var d) ? d : [];
            if (DocumentGaps.Compute(typeList, memberDocs, today).Count == 0) continue;
            incomplete.Add(memberId);
            primaryByMember.TryGetValue(memberId, out var primary);
            if (!string.IsNullOrWhiteSpace(resolver.Resolve(memberId, primary))) incompleteWithEmail.Add(memberId);
        }

        // Roll up per unit (a member counts once per unit they're active in). Only units WITH incomplete dossiers.
        var summary = assignments
            .Where(a => incomplete.Contains(a.MemberId))
            .GroupBy(a => new { a.UnitId, a.UnitName })
            .Select(g => new UnitReminderSummaryDto(
                g.Key.UnitId, g.Key.UnitName,
                g.Select(x => x.MemberId).Distinct().Count(),
                g.Select(x => x.MemberId).Distinct().Count(id => incompleteWithEmail.Contains(id))))
            .OrderByDescending(x => x.IncompleteCount).ThenBy(x => x.UnitName)
            .ToList();

        return Result<IReadOnlyList<UnitReminderSummaryDto>>.Success(summary);
    }
}

// ── Preview: the non-compliant members of a unit + their gaps + resolved contact email ──
public record GetDocumentReminderCandidatesQuery(Guid UnitId) : IRequest<Result<IReadOnlyList<DocReminderCandidateDto>>>;

public class GetDocumentReminderCandidatesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDocumentReminderCandidatesQuery, Result<IReadOnlyList<DocReminderCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<DocReminderCandidateDto>>> Handle(GetDocumentReminderCandidatesQuery request, CancellationToken ct)
    {
        // CG-level feature: only a whole-group manager (Chef de Groupe / Assistant CG / super-admin) may relance.
        // A group manager holds every unit, so any unitId is in scope (no per-unit leader check needed).
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<DocReminderCandidateDto>>.Failure("Accès réservé au Chef de Groupe.");

        var activeTypes = await context.DocumentTypes
            .Where(dt => dt.IsActive)
            .OrderBy(dt => dt.DisplayOrder).ThenBy(dt => dt.Name)
            .Select(dt => new { dt.Id, dt.Name, dt.Code })
            .ToListAsync(ct);
        if (activeTypes.Count == 0)
            return Result<IReadOnlyList<DocReminderCandidateDto>>.Success(new List<DocReminderCandidateDto>());
        var typeList = activeTypes.Select(t => (t.Id, t.Name, t.Code)).ToList();

        // Active members of the unit (+ their team, oldest-first order like the matrix).
        var memberAssignments = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null && !a.IsDeleted)
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, TeamName = a.Team != null ? a.Team.Name : null })
            .ToListAsync(ct);
        var memberIds = memberAssignments.Select(a => a.MemberId).Distinct().ToList();
        if (memberIds.Count == 0)
            return Result<IReadOnlyList<DocReminderCandidateDto>>.Success(new List<DocReminderCandidateDto>());

        var typeIds = typeList.Select(t => t.Id).ToList();
        var docs = await context.MemberDocuments
            .Where(d => memberIds.Contains(d.MemberId) && typeIds.Contains(d.DocumentTypeId))
            .Select(d => new { d.MemberId, d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt })
            .ToListAsync(ct);
        var docsByMember = docs
            .GroupBy(d => d.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(d => new DocumentGaps.DocFacts(d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt)).ToList());

        var resolver = await ContactEmailResolver.LoadAsync(context, memberIds, ct);
        var contactByMember = await context.Members
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.PrimaryContactEmail })
            .ToDictionaryAsync(m => m.Id, m => m.PrimaryContactEmail, ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var list = memberAssignments
            .GroupBy(a => a.MemberId)
            .Select(g =>
            {
                var first = g.First();
                var memberDocs = docsByMember.TryGetValue(g.Key, out var d) ? d : [];
                var gaps = DocumentGaps.Compute(typeList, memberDocs, today);
                if (gaps.Count == 0) return null; // compliant → not a reminder candidate
                contactByMember.TryGetValue(g.Key, out var primary);
                var email = resolver.Resolve(g.Key, primary);
                return new DocReminderCandidateDto(
                    g.Key, $"{first.FirstName} {first.LastName}".Trim(), first.TeamName,
                    gaps, !string.IsNullOrWhiteSpace(email), email);
            })
            .Where(x => x is not null)
            .Select(x => x!)
            .OrderBy(x => x.TeamName ?? "zzz").ThenBy(x => x.MemberName)
            .ToList();

        return Result<IReadOnlyList<DocReminderCandidateDto>>.Success(list);
    }
}

// ── Send: a reminder email per targeted member (whole unit or an explicit member list) ──
// Per-member outcome status: sent | no-email | compliant (nothing to remind) | no-access (out of scope).
public record DocReminderItem(Guid MemberId, string MemberName, string Status, string? Email);
public record SendDocumentRemindersResult(int Sent, int NoEmail, int Compliant, int NoAccess, List<DocReminderItem> Details);

public record SendDocumentRemindersCommand(Guid? UnitId, List<Guid>? MemberIds) : IRequest<Result<SendDocumentRemindersResult>>;

public class SendDocumentRemindersCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendDocumentRemindersCommand, Result<SendDocumentRemindersResult>>
{
    public async ValueTask<Result<SendDocumentRemindersResult>> Handle(SendDocumentRemindersCommand request, CancellationToken ct)
    {
        // ── Resolve the target member set + enforce unit-scoped access (mirrors "Envoyer les accès") ──
        List<Guid> targetIds;
        int noAccess = 0;
        if (request.MemberIds is { Count: > 0 })
        {
            var requested = request.MemberIds.Distinct().ToList();
            targetIds = requested;
            if (!currentUser.IsSuperAdmin)
            {
                var authIds = currentUser.AuthorizedUnitIds;
                var allowed = await context.MemberAssignments
                    .Where(a => requested.Contains(a.MemberId) && !a.IsDeleted && a.EndDate == null && authIds.Contains(a.UnitId))
                    .Select(a => a.MemberId).Distinct().ToListAsync(ct);
                targetIds = requested.Where(allowed.Contains).ToList(); // silently drop out-of-scope ids
                noAccess = requested.Count - targetIds.Count;
            }
        }
        else if (request.UnitId is Guid unitId)
        {
            if (!MemberAccess.IsGroupManager(currentUser))
                return Result<SendDocumentRemindersResult>.Failure("Accès réservé au Chef de Groupe.");
            targetIds = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && a.EndDate == null && !a.IsDeleted)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }
        else
        {
            return Result<SendDocumentRemindersResult>.Failure("Précisez une unité ou une liste de membres.");
        }

        if (targetIds.Count == 0)
            return Result<SendDocumentRemindersResult>.Success(new SendDocumentRemindersResult(0, 0, 0, noAccess, []));

        // Active doc types + these members' documents → recompute gaps server-side (never trust the client list).
        var activeTypes = await context.DocumentTypes
            .Where(dt => dt.IsActive).OrderBy(dt => dt.DisplayOrder).ThenBy(dt => dt.Name)
            .Select(dt => new { dt.Id, dt.Name, dt.Code }).ToListAsync(ct);
        var typeList = activeTypes.Select(t => (t.Id, t.Name, t.Code)).ToList();
        var typeIds = typeList.Select(t => t.Id).ToList();

        var members = await context.Members
            .Where(m => targetIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName, m.PrimaryContactEmail })
            .ToListAsync(ct);

        var docs = await context.MemberDocuments
            .Where(d => targetIds.Contains(d.MemberId) && typeIds.Contains(d.DocumentTypeId))
            .Select(d => new { d.MemberId, d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt })
            .ToListAsync(ct);
        var docsByMember = docs.GroupBy(d => d.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(d => new DocumentGaps.DocFacts(d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt)).ToList());

        // Each member's current active unit name (for the email body). One active unit is enough.
        var unitNameByMember = (await context.MemberAssignments
            .Where(a => targetIds.Contains(a.MemberId) && a.EndDate == null && !a.IsDeleted)
            .Select(a => new { a.MemberId, UnitName = a.Unit.Name })
            .ToListAsync(ct))
            .GroupBy(a => a.MemberId).ToDictionary(g => g.Key, g => g.First().UnitName);

        var resolver = await ContactEmailResolver.LoadAsync(context, targetIds, ct);
        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');
        var documentsUrl = $"{baseUrl}/my-documents";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var details = new List<DocReminderItem>();
        var jobs = new List<EmailJob>();
        int sent = 0, noEmail = 0, compliant = 0;

        foreach (var m in members)
        {
            var name = $"{m.FirstName} {m.LastName}".Trim();
            var memberDocs = docsByMember.TryGetValue(m.Id, out var d) ? d : [];
            var gaps = DocumentGaps.Compute(typeList, memberDocs, today);
            if (gaps.Count == 0) { compliant++; details.Add(new(m.Id, name, "compliant", null)); continue; }

            var email = resolver.Resolve(m.Id, m.PrimaryContactEmail);
            if (string.IsNullOrWhiteSpace(email)) { noEmail++; details.Add(new(m.Id, name, "no-email", null)); continue; }

            // Plain-text bulleted list; the template renders it in a white-space:pre-line block, so the newlines
            // show as line breaks even though EmailService HTML-encodes the substituted value (defense at the sink).
            var documentsList = string.Join("\n", gaps.Select(g => $"• {g.DocTypeName} — {DocumentGaps.FrenchReason(g.Reason)}"));
            unitNameByMember.TryGetValue(m.Id, out var unitName);

            jobs.Add(new EmailJob("document_reminder", email!, new Dictionary<string, string>
            {
                ["memberName"] = name,
                ["unitName"] = unitName ?? "",
                ["documentsList"] = documentsList,
                ["documentsUrl"] = documentsUrl,
            }));
            sent++; details.Add(new(m.Id, name, "sent", email));
        }

        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendDocumentReminders", "Member", null,
            newValues: new { sent, noEmail, compliant, unit = request.UnitId }, cancellationToken: ct);

        return Result<SendDocumentRemindersResult>.Success(new SendDocumentRemindersResult(sent, noEmail, compliant, noAccess, details));
    }
}
