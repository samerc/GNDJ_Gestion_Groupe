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
    {
        var me = await context.Members.Where(m => m.Id == memberId)
            .Select(m => new { m.IsOnHold, m.ContactReviewedAt, m.AppInstalledAt }).FirstOrDefaultAsync(ct);
        if (me is null) return null;

        var contactsDone = !ContactReview.IsDue(me.ContactReviewedAt, await ContactReview.YearStartAsync(context, ct));

        // Documents: the latest upload per active type (same checklist logic as « Mes documents »).
        var types = await context.DocumentTypes.Where(d => d.IsActive).Select(d => d.Id).ToListAsync(ct);
        var docs = await context.MemberDocuments
            .Where(d => d.MemberId == memberId && types.Contains(d.DocumentTypeId))
            .Select(d => new { d.DocumentTypeId, d.Status, d.ExpiryDate, d.CreatedAt })
            .ToListAsync(ct);
        var today = LebanonClock.Today;
        int approved = 0, pending = 0, rejected = 0, missing = 0;
        foreach (var t in types)
        {
            var d = docs.Where(x => x.DocumentTypeId == t).OrderByDescending(x => x.CreatedAt).FirstOrDefault();
            if (d is null || (d.Status == DocumentStatus.Approved && d.ExpiryDate is { } e && e < today)) missing++;
            else if (d.Status == DocumentStatus.Approved) approved++;
            else if (d.Status == DocumentStatus.Rejected) rejected++;
            else pending++;
        }
        var campaign = await DocumentCampaign.ForMemberAsync(context, memberId, ct);

        // Cotisation for the configured scout year.
        var year = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct);
        string? cotisStatus = null; var percent = 0;
        var showCotis = await context.Settings.Where(s => s.Key == "cotisation.show_in_rentree").Select(s => s.Value).FirstOrDefaultAsync(ct) == "true";
        if (showCotis && !string.IsNullOrWhiteSpace(year))
        {
            var isMaitrise = (await MaitriseCotisation.MemberIdsAsync(context, [memberId], ct)).Count > 0;
            if (isMaitrise && !await MaitriseCotisation.PaysAsync(context, ct))
                cotisStatus = null; // not asked this year
            else
            {
                var c = await context.MemberCotisations.Where(x => x.MemberId == memberId && x.ScoutYear == year)
                    .Select(x => new { x.WillNotPay, Payments = x.Payments.Where(p => !p.IsDeleted).Select(p => new { p.Amount, p.Currency }).ToList() })
                    .FirstOrDefaultAsync(ct);
                var cfg = await CotisationCalc.LoadAsync(context, ct);
                (cotisStatus, percent, _) = CotisationCalc.Evaluate(
                    c?.Payments.Select(p => (p.Amount, p.Currency)).ToList() ?? [], c?.WillNotPay ?? false, cfg);
            }
        }

        return new MyTodoDto(me.IsOnHold, contactsDone,
            types.Count, approved, pending, rejected, missing,
            campaign.UploadOpen, campaign.UploadClosesOn, campaign.UploadReopensOn,
            cotisStatus, percent, string.IsNullOrWhiteSpace(year) ? null : year,
            me.AppInstalledAt is not null);
    }
}
