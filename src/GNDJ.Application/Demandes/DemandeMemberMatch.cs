using System.Text;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// « Déjà membre ? » — flags a demande whose child looks like a member ALREADY in the group (a former member coming
// back, a child re-enrolled by a parent who didn't know, …). Computed live (on review / preview), so it covers every
// submitted demande — also ones edited after submission — without a stored flag. Only the CG's ANSWER is stored on
// the demande (MemberMatchId + MemberMatchStatus):
//   • Confirmed → the send updates that member instead of creating a second file (already sent → merged into it);
//   • Rejected  → that member is never suggested again for this demande (a new file is created as usual).
//
// A match needs the SAME birth date plus one of:
//   • same first + last name (accents, case, spaces and hyphens ignored), or the two swapped;
//   • same last name and a close first name (one contains the other, or 1–2 letters apart);
//   • same last name, or same first name, and a parent phone (last 7 digits) / email in common with the family.
// Apart from an identical full name, both genders must agree (when known) — so twins Léo / Léa aren't flagged.
public record DemandeMatchInput(Guid Id, string FirstName, string LastName, DateOnly? DateOfBirth, Guid AccountId,
    Guid? CreatedMemberId, Guid? MemberMatchId, string? MemberMatchStatus, string? Gender = null);

public record MemberMatchDto(
    Guid MemberId, string Name, string? CardNumber, DateOnly? DateOfBirth,
    string? UnitLabel,   // « Ronde 2 (actif) » or « Ronde 2 — jusqu'en 2024 »
    bool IsActive, string? Username,
    string Reason,       // why it was flagged, in French
    string? Status,      // null = to check · Confirmed · (Rejected matches are not returned)
    bool Merged);        // the demande's member IS this member (sent and handled)

public static class DemandeMemberMatch
{
    public static async Task<Dictionary<Guid, MemberMatchDto>> FindAsync(
        IApplicationDbContext context, IReadOnlyList<DemandeMatchInput> demandes, CancellationToken ct)
    {
        var result = new Dictionary<Guid, MemberMatchDto>();
        var withDob = demandes.Where(d => d.DateOfBirth != null).ToList();
        var confirmedIds = demandes.Where(d => d.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed && d.MemberMatchId != null)
            .Select(d => d.MemberMatchId!.Value).Distinct().ToList();
        if (withDob.Count == 0 && confirmedIds.Count == 0) return result;

        var dobs = withDob.Select(d => d.DateOfBirth!.Value).Distinct().ToList();
        var candidates = await context.Members
            .Where(m => (m.DateOfBirth != null && dobs.Contains(m.DateOfBirth.Value)) || confirmedIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.CardNumber, m.Gender })
            .ToListAsync(ct);
        if (candidates.Count == 0) return result;
        var candidateIds = candidates.Select(c => c.Id).ToList();

        // Parent contacts on both sides — only needed for the "name + parent in common" rule.
        var memberContacts = (await context.GuardianLinks
                .Where(l => candidateIds.Contains(l.MemberId))
                .Select(l => new
                {
                    l.MemberId,
                    Phones = l.Guardian.Phones.Select(p => p.Number).ToList(),
                    Emails = l.Guardian.Emails.Select(e => e.Address).ToList(),
                }).ToListAsync(ct))
            .GroupBy(x => x.MemberId)
            .ToDictionary(g => g.Key, g => ContactKeys(g.SelectMany(x => x.Phones), g.SelectMany(x => x.Emails)));
        var accountIds = withDob.Select(d => d.AccountId).Distinct().ToList();
        var familyContacts = (await context.ApplicantGuardians
                .Where(g => accountIds.Contains(g.ApplicantAccountId))
                .Select(g => new { g.ApplicantAccountId, g.PhoneNumber, g.Email }).ToListAsync(ct))
            .GroupBy(x => x.ApplicantAccountId)
            .ToDictionary(g => g.Key, g => ContactKeys(g.Select(x => x.PhoneNumber), g.Select(x => x.Email)));
        var accountEmails = await context.ApplicantAccounts.Where(a => accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, a => a.Email, ct);

        // Pick the best candidate per demande.
        var picks = new Dictionary<Guid, (Guid MemberId, string Reason, int Score)>();
        foreach (var d in demandes)
        {
            if (d.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed && d.MemberMatchId is Guid confirmedId)
            {
                if (candidates.Any(c => c.Id == confirmedId))
                    picks[d.Id] = (confirmedId, "Confirmé par le chef de groupe", 100);
                continue;
            }
            if (d.DateOfBirth is null) continue;

            var first = Key(d.FirstName);
            var last = Key(d.LastName);
            var family = familyContacts.GetValueOrDefault(d.AccountId) ?? [];
            if (accountEmails.GetValueOrDefault(d.AccountId) is string accEmail && !string.IsNullOrWhiteSpace(accEmail))
                family = [.. family, "e:" + accEmail.Trim().ToLowerInvariant()];

            (Guid, string, int)? best = null;
            foreach (var c in candidates)
            {
                if (c.DateOfBirth != d.DateOfBirth) continue;
                if (c.Id == d.CreatedMemberId) continue;                        // its own file (already sent)
                if (d.MemberMatchStatus == DemandeMemberMatchStatus.Rejected && d.MemberMatchId == c.Id) continue;

                var cFirst = Key(c.FirstName);
                var cLast = Key(c.LastName);
                var shared = family.Count > 0 && (memberContacts.GetValueOrDefault(c.Id) ?? []).Overlaps(family);

                (string, int)? hit = null;
                var genderClash = !string.IsNullOrWhiteSpace(d.Gender) && !string.IsNullOrWhiteSpace(c.Gender)
                    && Key(d.Gender) != Key(c.Gender);
                if (first == cFirst && last == cLast) hit = ("Même nom, prénom et date de naissance", 90);
                else if (genderClash) continue;
                else if (first == cLast && last == cFirst) hit = ("Nom et prénom inversés, même date de naissance", 80);
                else if (last == cLast && CloseNames(first, cFirst)) hit = ("Même nom et date de naissance, prénom proche", shared ? 75 : 60);
                else if (last == cLast && shared) hit = ("Même nom, date de naissance et parent en commun", 70);
                else if (first == cFirst && shared) hit = ("Même prénom, date de naissance et parent en commun", 65);
                if (hit is null) continue;

                var score = hit.Value.Item2 + (shared ? 5 : 0);
                if (best is null || score > best.Value.Item3)
                    best = (c.Id, hit.Value.Item1 + (shared && !hit.Value.Item1.Contains("parent") ? " — parent en commun" : ""), score);
            }
            if (best is not null) picks[d.Id] = best.Value;
        }
        if (picks.Count == 0) return result;

        // Details for the picked members: current unit (or last unit + year), login.
        var pickedIds = picks.Values.Select(p => p.MemberId).Distinct().ToList();
        var assignments = await context.MemberAssignments
            .Where(a => pickedIds.Contains(a.MemberId))
            .Select(a => new { a.MemberId, Unit = a.Unit.Name, a.StartDate, a.EndDate })
            .ToListAsync(ct);
        var usernames = await context.Users.Where(u => pickedIds.Contains(u.MemberId))
            .Select(u => new { u.MemberId, u.Email }).ToListAsync(ct);

        foreach (var d in demandes)
        {
            if (!picks.TryGetValue(d.Id, out var p)) continue;
            var c = candidates.First(x => x.Id == p.MemberId);
            var mine = assignments.Where(a => a.MemberId == c.Id).ToList();
            var active = mine.Where(a => a.EndDate == null).OrderByDescending(a => a.StartDate).FirstOrDefault();
            var lastEnded = mine.Where(a => a.EndDate != null).OrderByDescending(a => a.EndDate).FirstOrDefault();
            var unitLabel = active is not null ? $"{active.Unit} (actif)"
                : lastEnded is not null ? $"{lastEnded.Unit} — jusqu'en {lastEnded.EndDate!.Value.Year}" : null;
            result[d.Id] = new MemberMatchDto(
                c.Id, $"{c.FirstName} {c.LastName}", c.CardNumber, c.DateOfBirth, unitLabel, active is not null,
                usernames.FirstOrDefault(u => u.MemberId == c.Id)?.Email, p.Reason,
                d.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed ? DemandeMemberMatchStatus.Confirmed : null,
                d.CreatedMemberId == c.Id);
        }
        return result;
    }

    // Letters and digits only, lowercase, no accents: « Abi-Nassif » ≡ « abi nassif ».
    public static string Key(string? s)
    {
        var n = TextNormalization.NormalizeKey(s ?? "");
        var sb = new StringBuilder(n.Length);
        foreach (var ch in n) if (char.IsLetterOrDigit(ch)) sb.Append(ch);
        return sb.ToString();
    }

    // One first name contains the other (« Jean » / « Jean-Paul »), or at most 2 letters apart (« Mateo » / « Matteo »).
    public static bool CloseNames(string a, string b)
    {
        if (a.Length == 0 || b.Length == 0) return false;
        if (a.Length >= 3 && b.Length >= 3 && (a.Contains(b) || b.Contains(a))) return true;
        return Math.Abs(a.Length - b.Length) <= 2 && Levenshtein(a, b) <= (Math.Min(a.Length, b.Length) >= 5 ? 2 : 1);
    }

    private static int Levenshtein(string a, string b)
    {
        var prev = new int[b.Length + 1];
        var cur = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) prev[j] = j;
        for (var i = 1; i <= a.Length; i++)
        {
            cur[0] = i;
            for (var j = 1; j <= b.Length; j++)
                cur[j] = Math.Min(Math.Min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            (prev, cur) = (cur, prev);
        }
        return prev[b.Length];
    }

    // Phones as their last 7 digits ("p:…"), emails lowercased ("e:…").
    private static HashSet<string> ContactKeys(IEnumerable<string?> phones, IEnumerable<string?> emails)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var p in phones)
        {
            var digits = new string((p ?? "").Where(char.IsDigit).ToArray());
            if (digits.Length >= 7) set.Add("p:" + digits[^7..]);
        }
        foreach (var e in emails)
            if (!string.IsNullOrWhiteSpace(e)) set.Add("e:" + e.Trim().ToLowerInvariant());
        return set;
    }

    public static DemandeMatchInput Input(Domain.Entities.Demande d) =>
        new(d.Id, d.FirstName, d.LastName, d.DateOfBirth, d.ApplicantAccountId, d.CreatedMemberId, d.MemberMatchId, d.MemberMatchStatus, d.Gender);
}
