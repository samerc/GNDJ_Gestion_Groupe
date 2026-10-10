using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// « Demande précédente » — finds the same child in the demande ARCHIVE (closed campaigns of earlier years), computed
// live like « Déjà membre ? » (DemandeMemberMatch), so the CG sees at once that a family applied before and what the
// answer was (refused + motif, accepted into which unit), whatever the family declared. A past demande matches on:
//   - the same birth date + the same name (accent/case/space-insensitive, first/last swapped) or the same last name
//     with a close first name (« Mateo » / « Matteo »);
//   - the same applicant-account email + a close first name (a typo in the birth date, same family);
//   - the same full name when one side has no birth date.
// Nothing is stored: the archive is a read-only history.

public record ArchiveMatchDto(
    string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, string Status,
    string? DecidedUnitName, string? DecisionNotes, string? CreatedMemberCardNumber, string How);

public record DemandeArchiveInput(Guid Id, string ScoutYear, string FirstName, string LastName, DateOnly? DateOfBirth, string? AccountEmail);

public static class DemandeArchiveMatch
{
    public static async Task<Dictionary<Guid, List<ArchiveMatchDto>>> FindAsync(
        IApplicationDbContext context, IReadOnlyList<DemandeArchiveInput> demandes, CancellationToken ct)
    {
        var result = new Dictionary<Guid, List<ArchiveMatchDto>>();
        if (demandes.Count == 0) return result;

        var dobs = demandes.Where(d => d.DateOfBirth.HasValue).Select(d => d.DateOfBirth!.Value).Distinct().ToList();
        var emails = demandes.Where(d => !string.IsNullOrWhiteSpace(d.AccountEmail))
            .Select(d => d.AccountEmail!.Trim().ToLower()).Distinct().ToList();
        var years = demandes.Select(d => d.ScoutYear).Distinct().ToList();
        // Candidates only (the archive grows by a few hundred rows a year): same birth date, same account email, or
        // no birth date. Never the demande's own year (a campaign is archived only when it is closed).
        var candidates = await context.DemandeArchives.AsNoTracking()
            .Where(a => !years.Contains(a.ScoutYear)
                && (a.DateOfBirth == null || dobs.Contains(a.DateOfBirth.Value)
                    || (a.AccountEmail != null && emails.Contains(a.AccountEmail.Trim().ToLower()))))
            .Select(a => new
            {
                a.ScoutYear, a.FirstName, a.LastName, a.DateOfBirth, a.AccountEmail, a.Status,
                a.DecidedUnitName, a.DecisionNotes, a.CreatedMemberCardNumber,
            })
            .ToListAsync(ct);
        if (candidates.Count == 0) return result;

        foreach (var d in demandes)
        {
            var first = DemandeMemberMatch.Key(d.FirstName);
            var last = DemandeMemberMatch.Key(d.LastName);
            if (first.Length == 0 && last.Length == 0) continue;
            var email = d.AccountEmail?.Trim().ToLowerInvariant();
            var found = new List<ArchiveMatchDto>();
            foreach (var a in candidates)
            {
                if (a.ScoutYear == d.ScoutYear) continue;
                var af = DemandeMemberMatch.Key(a.FirstName);
                var al = DemandeMemberMatch.Key(a.LastName);
                var sameName = (af == first && al == last) || (af == last && al == first);
                string? how = null;
                if (d.DateOfBirth.HasValue && a.DateOfBirth == d.DateOfBirth)
                {
                    if (sameName) how = "même nom et date de naissance";
                    else if (al == last && DemandeMemberMatch.CloseNames(af, first)) how = "même nom de famille, prénom proche et même date de naissance";
                }
                if (how is null && email is not null && a.AccountEmail?.Trim().ToLowerInvariant() == email
                    && (af == first || DemandeMemberMatch.CloseNames(af, first)))
                    how = "même compte d'inscription et prénom";
                if (how is null && sameName && (a.DateOfBirth is null || d.DateOfBirth is null))
                    how = "même nom (date de naissance manquante)";
                if (how is null) continue;
                found.Add(new ArchiveMatchDto(a.ScoutYear, a.FirstName, a.LastName, a.DateOfBirth, a.Status,
                    a.DecidedUnitName, a.DecisionNotes, a.CreatedMemberCardNumber, how));
            }
            if (found.Count > 0) result[d.Id] = found.OrderByDescending(x => x.ScoutYear).ToList();
        }
        return result;
    }

    // One line for a notification: « 2025-2026 (refusée) ».
    public static string Summary(IEnumerable<ArchiveMatchDto> matches)
        => string.Join(", ", matches.Select(m => $"{m.ScoutYear} ({StatusLabel(m.Status)})"));

    public static string StatusLabel(string status) => status switch
    {
        "Approved" => "acceptée",
        "Declined" => "refusée",
        "AlreadyMember" => "déjà membre",
        "Draft" => "brouillon",
        _ => "non décidée",
    };
}
