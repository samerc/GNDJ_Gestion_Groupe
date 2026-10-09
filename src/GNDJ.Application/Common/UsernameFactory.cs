using System.Text;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Shared generation of the synthetic login username (prenom.nom@domain) — used by member creation, the "create
// missing logins" tool AND the demande send, so all three produce identical usernames. On a duplicate it
// disambiguates with the father's first initial (prenom.i.nom), then a numeric suffix (prenom.i.nom2, …).
public static class UsernameFactory
{
    // One name part → only a–z, 0–9 and inner hyphens: lower case, every accent removed (é → e, ñ → n, œ → oe),
    // spaces / apostrophes / dots / anything else dropped. « Jean Marie » → « jeanmarie », « D'Amour » → « damour »,
    // « Jean-Paul » → « jean-paul ».
    public static string Normalize(string name)
    {
        var plain = TextNormalization.RemoveDiacritics(name ?? "").ToLowerInvariant()
            .Replace("œ", "oe").Replace("æ", "ae").Replace("ß", "ss");
        var sb = new StringBuilder(plain.Length);
        foreach (var c in plain)
        {
            if (c is >= 'a' and <= 'z' or >= '0' and <= '9') sb.Append(c);
            else if (c == '-' && sb.Length > 0 && sb[^1] != '-') sb.Append(c);
        }
        return sb.ToString().TrimEnd('-');
    }

    // The configured login domain (setting user_domain, e.g. "scouts.gndj"; default if unset).
    public static async Task<string> GetDomainAsync(IApplicationDbContext context, CancellationToken ct) =>
        await context.Settings.Where(s => s.Key == "user_domain").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "scouts.gndj";

    // The usernames to try, in order: prenom.nom, then prenom.i.nom (father's first letter, when known), then
    // prenom.i.nom2, prenom.i.nom3, … — endless, the caller stops at the first free one.
    public static IEnumerable<string> Candidates(string firstName, string lastName, string? fatherName, string domain)
    {
        var fn = Normalize(firstName);
        var ln = Normalize(lastName);
        yield return $"{fn}.{ln}@{domain}";
        var initial = Normalize(fatherName ?? "").FirstOrDefault(char.IsLetter);
        var mid = initial != default ? $".{initial}" : "";
        if (mid != "") yield return $"{fn}{mid}.{ln}@{domain}";
        for (var suffix = 2; ; suffix++) yield return $"{fn}{mid}.{ln}{suffix}@{domain}";
    }

    // First free candidate against an in-memory set of taken usernames (case-insensitive) — for bulk callers that
    // pre-loaded every existing login (the demande send). Add the result to the set before the next call.
    public static string PickUnique(string firstName, string lastName, string? fatherName, string domain, Func<string, bool> taken) =>
        Candidates(firstName, lastName, fatherName, domain).First(e => !taken(e));

    // Build a unique login email, checking the database. `extraTaken` lets a BULK caller also avoid usernames it has
    // assigned earlier in the same batch but not yet saved (two same-name members would otherwise collide on
    // SaveChanges) — pass a running set and add each returned username to it.
    public static async Task<string> GenerateUniqueAsync(
        IApplicationDbContext context, string firstName, string lastName, string? fatherName, string domain,
        CancellationToken ct, ISet<string>? extraTaken = null)
    {
        foreach (var email in Candidates(firstName, lastName, fatherName, domain))
            if (!(extraTaken?.Contains(email) ?? false) && !await context.Users.AnyAsync(u => u.Email == email, ct))
                return email;
        throw new InvalidOperationException("unreachable");
    }
}
