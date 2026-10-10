using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Cotisations;
using GNDJ.Application.Documents;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries.MyTodo;

// « Ma rentrée » — what the signed-in member still has to do this year, shown at the top of Ma fiche. AUTH-ONLY,
// own member resolved server-side. Each item ticks itself off from the real data:
//   • Coordonnées  — confirmed this year (same rule as the popup, Common/ContactReview);
//   • Documents    — every active document type sent (pending counts as sent; refused / expired = to redo);
//   • Cotisation   — this year's cotisation (passage.scout_year) paid in full or exempt; only when the CG turned
//                    on cotisation.show_in_rentree (off by default: payments must be recorded in the app first);
//                    not asked from the maîtrise when « La maîtrise paie » is off;
//   • App          — installed (optional, never blocks « Tout est en ordre »).
public record MyTodoDto(
    bool OnHold,
    bool ContactsDone,
    int DocsTotal, int DocsApproved, int DocsPending, int DocsRejected, int DocsMissing,
    bool UploadOpen, DateOnly? UploadClosesOn, DateOnly? UploadReopensOn,
    string? CotisationStatus, int CotisationPercent, string? ScoutYear,
    bool AppInstalled);

public record GetMyTodoQuery : IRequest<MyTodoDto?>;

public class GetMyTodoQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMyTodoQuery, MyTodoDto?>
{
    public async ValueTask<MyTodoDto?> Handle(GetMyTodoQuery request, CancellationToken ct) =>
        currentUser.MemberId is Guid memberId ? await MemberTodo.ComputeAsync(context, memberId, ct) : null;
}

// The to-do of one member — shared by « Ma rentrée » (own) and « Ma famille » (each confirmed sibling).
public static class MemberTodo
{
    public static async Task<MyTodoDto?> ComputeAsync(IApplicationDbContext context, Guid memberId, CancellationToken ct)
        => (await ComputeManyAsync(context, [memberId], ct)).GetValueOrDefault(memberId);

    // Several members at once (« Ma famille »): group-wide data (settings, document types, campaign) is read once and
    // each per-member table in one query for everyone, so a family of four costs the same handful of queries as one
    // member. Unknown / deleted ids are left out of the result.
    public static async Task<Dictionary<Guid, MyTodoDto>> ComputeManyAsync(
        IApplicationDbContext context, IReadOnlyCollection<Guid> memberIds, CancellationToken ct)
    {
        var ids = memberIds.Distinct().ToList();
        var members = await context.Members.Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.IsOnHold, m.ContactReviewedAt, m.AppInstalledAt }).ToListAsync(ct);
        if (members.Count == 0) return [];
        ids = members.Select(m => m.Id).ToList();

        var yearStart = await ContactReview.YearStartAsync(context, ct);

        // Documents: the latest upload per active type (same checklist logic as « Mes documents »).
        var types = await context.DocumentTypes.Where(d => d.IsActive && d.IsRequired).Select(d => d.Id).ToListAsync(ct); // optional docs aren't a « to do »
        var docsByMember = (await context.MemberDocuments
                .Where(d => ids.Contains(d.MemberId) && types.Contains(d.DocumentTypeId))
                .Select(d => new { d.MemberId, d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt })
                .ToListAsync(ct))
            .ToLookup(d => d.MemberId);
        var campaigns = await DocumentCampaign.ForMembersAsync(context, await DocumentCampaign.LoadAsync(context, ct), ids, ct);

        // Cotisation for the configured scout year (only when the CG shows it in « Ma rentrée »).
        var settings = await context.Settings
            .Where(s => s.Key == "passage.scout_year" || s.Key == "cotisation.show_in_rentree")
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        var year = settings.GetValueOrDefault("passage.scout_year");
        var showCotis = settings.GetValueOrDefault("cotisation.show_in_rentree") == "true" && !string.IsNullOrWhiteSpace(year);
        HashSet<Guid> notAsked = [];
        Dictionary<Guid, (bool WillNotPay, List<(decimal Amount, string Currency)> Payments)> cotisations = [];
        CotisationCalc.Config? cfg = null;
        if (showCotis)
        {
            // The maîtrise isn't asked when « La maîtrise paie » is off.
            if (!await MaitriseCotisation.PaysAsync(context, ct))
                notAsked = await MaitriseCotisation.MemberIdsAsync(context, ids, ct);
            cotisations = (await context.MemberCotisations.Where(x => ids.Contains(x.MemberId) && x.ScoutYear == year)
                    .Select(x => new { x.MemberId, x.WillNotPay, Payments = x.Payments.Where(p => !p.IsDeleted).Select(p => new { p.Amount, p.Currency }).ToList() })
                    .ToListAsync(ct))
                .GroupBy(x => x.MemberId)
                .ToDictionary(g => g.Key, g => (g.First().WillNotPay, g.First().Payments.Select(p => (p.Amount, p.Currency)).ToList()));
            cfg = await CotisationCalc.LoadAsync(context, ct);
        }

        var today = LebanonClock.Today;
        var result = new Dictionary<Guid, MyTodoDto>();
        foreach (var me in members)
        {
            var docs = docsByMember[me.Id].ToList();
            int approved = 0, pending = 0, rejected = 0, missing = 0;
            foreach (var t in types)
            {
                var d = docs.Where(x => x.DocumentTypeId == t).OrderByDescending(x => x.CreatedAt).FirstOrDefault();
                if (d is null || (d.Status == DocumentStatus.Approved && d.ExpiryDate is { } e && e < today)) missing++;
                else if (d.Status == DocumentStatus.Approved) approved++;
                else if (d.Status == DocumentStatus.Rejected) rejected++;
                else pending++;
            }

            string? cotisStatus = null; var percent = 0;
            if (showCotis && !notAsked.Contains(me.Id))
            {
                var c = cotisations.GetValueOrDefault(me.Id);
                (cotisStatus, percent, _) = CotisationCalc.Evaluate(c.Payments ?? [], c.WillNotPay, cfg!);
            }

            var campaign = campaigns[me.Id];
            result[me.Id] = new MyTodoDto(me.IsOnHold, !ContactReview.IsDue(me.ContactReviewedAt, yearStart),
                types.Count, approved, pending, rejected, missing,
                campaign.UploadOpen, campaign.UploadClosesOn, campaign.UploadReopensOn,
                cotisStatus, percent, string.IsNullOrWhiteSpace(year) ? null : year,
                me.AppInstalledAt is not null);
        }
        return result;
    }
}
