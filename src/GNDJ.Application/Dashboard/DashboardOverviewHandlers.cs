using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Cotisations;
using GNDJ.Application.Rentree;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Dashboard;

// ── Home "action hub" overview ───────────────────────────────────────────────
// Everything on the Accueil dashboard that is TIMELY / ACTIONABLE (as opposed to the year-scoped stats +
// charts served by GetAdminDashboardQuery). Computed "now": action items awaiting the CG, the enrollment
// campaign pipeline, rentrée progress, cotisation collection, and a members-vs-last-year trend. Group-level
// only (super-admin / Chef de Groupe / ACG). Fetched once by the landing page; the stats keep their own
// year-scoped query so the year selector doesn't refetch this.
public record DashboardOverviewDto(
    // Action items — each links to its page on the frontend.
    int PendingDemandes,          // demandes submitted this campaign, still undecided
    int PendingChangeRequests,    // member-proposed progression/assignment changes awaiting review
    int PassagesToFinalize,       // passage lines approved but not yet finalized
    int PendingDocuments,         // documents uploaded, awaiting CU/CG verification (group-wide)
    int MembersOnHold,            // suspended members (incomplete dossier)
    // Enrollment campaign (demande scout year).
    DemandeCampaignDto Campaign,
    // Rentrée checklist progress for the operating (passage) scout year — null when no checklist generated.
    RentreeSummaryDto? Rentree,
    // Cotisation collection for the operating scout year (group-wide).
    CotisationOverviewDto Cotisations,
    // Trend: members active now vs. the same point of the previous scout year.
    int MembersThisYear, int MembersLastYear, string ThisYear, string LastYear);

public record DemandeCampaignDto(
    bool Enabled, int Total, int Pending, int Approved, int Declined, int ResponsesSent, int Decided, int AcceptanceRate);

public record RentreeSummaryDto(string ScoutYear, int Total, int Done);

public record CotisationOverviewDto(int Total, int Paid, int Unpaid, int Exempt);

public record GetDashboardOverviewQuery : IRequest<DashboardOverviewDto>;

public class GetDashboardOverviewQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDashboardOverviewQuery, DashboardOverviewDto>
{
    public async ValueTask<DashboardOverviewDto> Handle(GetDashboardOverviewQuery request, CancellationToken ct)
    {
        // Same gate as the group overview: super-admin, Chef de Groupe (maitrise.manage), or a group-level
        // role holder (ACG). Everything below is group-wide, so no unit scoping is applied.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(Permissions.MaitriseManage))
        {
            var isGroupLevel = currentUser.MemberId is Guid mid && await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == mid && a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.IsGroupLevel, ct);
            if (!isGroupLevel) throw new UnauthorizedAccessException();
        }

        // The two "current year" notions: demandes track their own campaign year; passage/rentrée/cotisation
        // track the operating year.
        var settings = await context.Settings
            .Where(s => s.Key == "demande.scout_year" || s.Key == "passage.scout_year" || s.Key == "demande.enabled")
            .Select(s => new { s.Key, s.Value }).ToListAsync(ct);
        string SettingOr(string key, string fallback) => settings.FirstOrDefault(s => s.Key == key)?.Value is { Length: > 0 } v ? v : fallback;
        var operatingYear = SettingOr("passage.scout_year", ScoutYearHelper.Of(LebanonClock.Today));
        var demandeYear = SettingOr("demande.scout_year", operatingYear);
        var demandeEnabled = SettingOr("demande.enabled", "false") == "true";

        // ── Action items ──
        var pendingDemandes = await context.Demandes
            .CountAsync(d => d.ScoutYear == demandeYear && d.Status == DemandeStatus.Submitted && d.ResponseSentAt == null, ct);
        var pendingChangeRequests = await context.MemberChangeRequests
            .CountAsync(r => r.Status == ChangeRequests.ChangeRequestStatus.Pending, ct);
        var passagesToFinalize = await context.Passages
            .CountAsync(p => p.ScoutYear == operatingYear && p.Status == PassageStatus.Approved, ct);
        var pendingDocuments = await context.MemberDocuments
            .CountAsync(d => d.Status == DocumentStatus.Pending && d.DocumentType.IsActive, ct);
        var membersOnHold = await context.Members.CountAsync(m => m.IsOnHold, ct);

        // ── Campaign pipeline (over non-draft demandes of the campaign year) ──
        var demStatuses = await context.Demandes
            .Where(d => d.ScoutYear == demandeYear && d.Status != DemandeStatus.Draft)
            .Select(d => new { d.Status, Sent = d.ResponseSentAt != null })
            .ToListAsync(ct);
        var campTotal = demStatuses.Count;
        var campPending = demStatuses.Count(d => d.Status == DemandeStatus.Submitted && !d.Sent);
        var campApproved = demStatuses.Count(d => d.Status == DemandeStatus.Approved);
        var campDeclined = demStatuses.Count(d => d.Status == DemandeStatus.Declined);
        var campSent = demStatuses.Count(d => d.Sent);
        var campDecided = campApproved + campDeclined;
        var acceptanceRate = campDecided > 0 ? (int)Math.Round(100.0 * campApproved / campDecided) : 0;
        var campaign = new DemandeCampaignDto(demandeEnabled, campTotal, campPending, campApproved, campDeclined, campSent, campDecided, acceptanceRate);

        // ── Rentrée checklist progress (rolled up like the /rentree page: per-unit instances of one template
        // collapse into a single row; a rollup is done when every instance is effectively done). ──
        RentreeSummaryDto? rentree = null;
        var rentreeTasks = await context.RentreeTasks.Where(t => t.ScoutYear == operatingYear).ToListAsync(ct);
        if (rentreeTasks.Count > 0)
        {
            var progress = await RentreeProgress.ComputeAsync(context, rentreeTasks, operatingYear, ct);
            bool Done(GNDJ.Domain.Entities.RentreeTask t) => t.Status == "done" || (progress.TryGetValue(t.Id, out var st) && st.Complete);
            // One-off tasks (TemplateId == null) each key by their own id → their own rollup group.
            var rollups = rentreeTasks.GroupBy(t => t.TemplateId ?? t.Id).ToList();
            rentree = new RentreeSummaryDto(operatingYear, rollups.Count, rollups.Count(g => g.All(Done)));
        }

        // ── Cotisation collection (group-wide, operating year) ──
        var activeMemberIds = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        var cotisations = await context.MemberCotisations
            .Where(c => c.ScoutYear == operatingYear && activeMemberIds.Contains(c.MemberId))
            .Select(c => new { c.MemberId, c.WillNotPay, HasPayment = c.Payments.Any(p => !p.IsDeleted) })
            .ToListAsync(ct);
        var paidSet = cotisations.Where(c => c.HasPayment).Select(c => c.MemberId).ToHashSet();
        var exemptSet = cotisations.Where(c => c.WillNotPay && !c.HasPayment).Select(c => c.MemberId).ToHashSet();
        // "La maîtrise ne paie pas" → treat unpaid maîtrise as exempt (mirrors the cotisation summary/dashboard).
        if (!await MaitriseCotisation.PaysAsync(context, ct))
            foreach (var id in await MaitriseCotisation.MemberIdsAsync(context, activeMemberIds, ct))
                if (!paidSet.Contains(id)) exemptSet.Add(id);
        var cotTotal = activeMemberIds.Count;
        var cotPaid = paidSet.Count;
        var cotExempt = exemptSet.Count(id => !paidSet.Contains(id));
        var cotUnpaid = cotTotal - cotPaid - cotExempt;
        var cotisationsOverview = new CotisationOverviewDto(cotTotal, cotPaid, cotUnpaid, cotExempt);

        // ── Trend: members active NOW vs. members active during the previous scout year's window ──
        var today = LebanonClock.Today;
        var membersThisYear = await context.Members
            .CountAsync(m => m.Assignments.Any(a => a.EndDate == null && a.StartDate <= today), ct);
        var lastYear = PreviousScoutYear(operatingYear);
        var (prevStart, prevEnd) = ScoutYearHelper.Window(lastYear);
        var membersLastYear = await context.Members
            .CountAsync(m => m.Assignments.Any(a => a.StartDate < prevEnd && (a.EndDate == null || a.EndDate > prevStart)), ct);

        return new DashboardOverviewDto(
            pendingDemandes, pendingChangeRequests, passagesToFinalize, pendingDocuments, membersOnHold,
            campaign, rentree, cotisationsOverview,
            membersThisYear, membersLastYear, operatingYear, lastYear);
    }

    // "2026-2027" → "2025-2026" (falls back to shifting the label's first year by one).
    private static string PreviousScoutYear(string year)
    {
        var first = year.Split('-')[0].Trim();
        return int.TryParse(first, out var y) ? $"{y - 1}-{y}" : year;
    }
}
