using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Application.Members;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.DataQuality;

// "Qualité des données" (CG): one place listing what needs fixing in the member data, each line linking to the
// member file. Scope = ACTIVE members (an active assignment) — alumni aren't chased. Sections:
//  - bad-email:     an email on file (member's own, a parent's, or the primary contact) that can't work
//  - bounced-email: an address the providers reported as undeliverable / spam (webhooks), with its owners
//  - no-email:      no reachable email at all (own → primary contact → a parent's)
//  - no-dob / no-gender: missing basic identity fields
//  - duplicates:    count of likely duplicate records (fixed on Fratries → Doublons)
public record DataQualityItemDto(Guid? MemberId, string Name, string? Unit, string Detail, Guid? BounceId = null);
public record DataQualitySectionDto(string Key, string Title, string Hint, int Total, List<DataQualityItemDto> Items);
public record DataQualityReportDto(int ActiveMembers, List<DataQualitySectionDto> Sections);

public record GetDataQualityReportQuery() : IRequest<Result<DataQualityReportDto>>;

public class GetDataQualityReportQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, IMediator mediator)
    : IRequestHandler<GetDataQualityReportQuery, Result<DataQualityReportDto>>
{
    private const int MaxItems = 500; // per section (the total is always exact)

    public async ValueTask<Result<DataQualityReportDto>> Handle(GetDataQualityReportQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) throw new UnauthorizedAccessException("Accès réservé au chef de groupe.");

        // Active members + their unit code (first active assignment).
        var active = await context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new { a.MemberId, a.Unit.Code, m = a.Member })
            .Select(x => new { x.MemberId, x.Code, x.m.FirstName, x.m.LastName, x.m.DateOfBirth, x.m.Gender, x.m.PrimaryContactEmail })
            .ToListAsync(ct);
        var members = active.GroupBy(a => a.MemberId).Select(g => g.First()).ToDictionary(a => a.MemberId);
        var ids = members.Keys.ToList();
        string Name(Guid id) => $"{members[id].LastName} {members[id].FirstName}".Trim();
        string? Unit(Guid id) => members[id].Code;
        DataQualityItemDto Item(Guid id, string detail, Guid? bounceId = null) => new(id, Name(id), Unit(id), detail, bounceId);

        // Every email attached to an active member: own, primary contact, parents'.
        var own = await context.MemberEmails.Where(e => ids.Contains(e.MemberId))
            .Select(e => new { e.MemberId, e.Address }).ToListAsync(ct);
        var links = await context.GuardianLinks.Where(l => ids.Contains(l.MemberId))
            .Select(l => new { l.MemberId, l.GuardianId, l.Guardian.FirstName, l.Guardian.LastName }).ToListAsync(ct);
        var gids = links.Select(l => l.GuardianId).Distinct().ToList();
        var parentEmails = await context.GuardianEmails.Where(e => gids.Contains(e.GuardianId))
            .Select(e => new { e.GuardianId, e.Address }).ToListAsync(ct);

        var all = new List<(Guid MemberId, string Address, string Owner)>();
        all.AddRange(own.Select(e => (e.MemberId, e.Address, "email du membre")));
        all.AddRange(members.Values.Where(m => !string.IsNullOrWhiteSpace(m.PrimaryContactEmail))
            .Select(m => (m.MemberId, m.PrimaryContactEmail!, "courriel principal")));
        var parentByGuardian = parentEmails.ToLookup(e => e.GuardianId, e => e.Address);
        foreach (var l in links)
            foreach (var addr in parentByGuardian[l.GuardianId])
                all.Add((l.MemberId, addr, $"parent {l.FirstName} {l.LastName}".Trim()));

        var sections = new List<DataQualitySectionDto>();

        // 1. Emails that can't work (same rule as the forms: something@domain.tld, no spaces).
        var bad = all.Where(e => !ValidationExtensions.IsRealEmail(e.Address))
            .DistinctBy(e => (e.MemberId, e.Address.Trim().ToLowerInvariant()))
            .OrderBy(e => Unit(e.MemberId)).ThenBy(e => Name(e.MemberId)).ToList();
        sections.Add(new("bad-email", "Adresses email invalides",
            "Ces adresses ne peuvent pas recevoir d'email (faute de frappe, domaine incomplet…). Corrigez-les dans la fiche.",
            bad.Count, bad.Take(MaxItems).Select(e => Item(e.MemberId, $"« {e.Address} » ({e.Owner})")).ToList()));

        // 2. Addresses the providers reported as undeliverable, with their owners among active members.
        var bounces = await context.EmailBounces.OrderByDescending(b => b.LastAt).ToListAsync(ct);
        var byAddress = all.ToLookup(e => e.Address.Trim().ToLowerInvariant());
        var bounceItems = new List<DataQualityItemDto>();
        foreach (var b in bounces)
        {
            var kind = b.Kind == "complaint" ? "signalé comme spam" : b.Kind == "soft" ? $"échec temporaire ×{b.Count}" : "adresse inexistante";
            var detail = $"« {b.Address} » — {kind}{(b.Suppressed ? " — plus d'envoi" : "")}{(string.IsNullOrWhiteSpace(b.Reason) ? "" : $" ({b.Reason})")}";
            var owners = byAddress[b.Address].DistinctBy(o => o.MemberId).ToList();
            if (owners.Count == 0) bounceItems.Add(new(null, b.Address, null, detail + " — aucun membre actif", b.Id));
            else bounceItems.AddRange(owners.Select(o => Item(o.MemberId, $"{detail} — {o.Owner}", b.Id)));
        }
        sections.Add(new("bounced-email", "Emails en échec (signalés par le fournisseur)",
            "Le fournisseur n'a pas pu livrer ces emails. Corrigez l'adresse dans la fiche puis cliquez « Réactiver ».",
            bounceItems.Count, bounceItems.Take(MaxItems).ToList()));

        // 3. No reachable email at all.
        var resolver = await ContactEmailResolver.LoadAsync(context, ids, ct);
        var noEmail = ids.Where(id => resolver.Resolve(id, members[id].PrimaryContactEmail) is null)
            .OrderBy(Unit).ThenBy(Name).ToList();
        sections.Add(new("no-email", "Membres sans aucun email",
            "Ni email personnel, ni courriel principal, ni email de parent : ils ne reçoivent aucun envoi (accès, relances…).",
            noEmail.Count, noEmail.Take(MaxItems).Select(id => Item(id, "Aucun email")).ToList()));

        // 4-5. Missing identity fields.
        var noDob = ids.Where(id => members[id].DateOfBirth is null).OrderBy(Unit).ThenBy(Name).ToList();
        sections.Add(new("no-dob", "Date de naissance manquante", "Utile pour l'âge, les anniversaires et le passage.",
            noDob.Count, noDob.Take(MaxItems).Select(id => Item(id, "Date de naissance vide")).ToList()));
        var noGender = ids.Where(id => string.IsNullOrWhiteSpace(members[id].Gender)).OrderBy(Unit).ThenBy(Name).ToList();
        sections.Add(new("no-gender", "Genre manquant", "Utile pour le passage (branches garçons / filles) et les rapports.",
            noGender.Count, noGender.Take(MaxItems).Select(id => Item(id, "Genre vide")).ToList()));

        // 6. Likely duplicates (same name + date of birth) — fixed with the Doublons tool.
        var dup = await mediator.Send(new GetDuplicateMemberSuggestionsQuery(), ct);
        var groups = dup.IsSuccess ? dup.Value! : [];
        sections.Add(new("duplicates", "Doublons probables",
            "Même nom et même date de naissance. Fusionnez-les dans Fratries → Doublons.",
            groups.Count, []));

        return Result<DataQualityReportDto>.Success(new DataQualityReportDto(ids.Count, sections));
    }
}
