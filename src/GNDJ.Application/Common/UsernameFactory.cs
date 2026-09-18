using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Shared generation of the synthetic login username (prenom.nom@domain) — used by member creation AND the
// "create missing logins" tool so both produce identical usernames. On a duplicate it disambiguates with the
// father's first initial (prenom.i.nom), then a numeric suffix.
public static class UsernameFactory
{
    // Strip accents/apostrophes and lowercase, spaces → dots (so "Jean Marie" → "jean.marie").
    public static string Normalize(string name)
    {
        return (name ?? "").Trim().ToLower()
            .Replace(' ', '.')
            .Replace('é', 'e').Replace('è', 'e').Replace('ê', 'e').Replace('ë', 'e')
            .Replace('à', 'a').Replace('â', 'a').Replace('ä', 'a')
            .Replace('ù', 'u').Replace('û', 'u').Replace('ü', 'u')
            .Replace('ô', 'o').Replace('ö', 'o')
            .Replace('î', 'i').Replace('ï', 'i')
            .Replace('ç', 'c')
            .Replace("'", "");
    }

    // The configured login domain (setting user_domain, e.g. "scouts.gndj"; default if unset).
    public static async Task<string> GetDomainAsync(IApplicationDbContext context, CancellationToken ct) =>
        await context.Settings.Where(s => s.Key == "user_domain").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "scouts.gndj";

    // Build a unique login email. Collisions are checked against ALL user rows (deleted included, matching member
    // creation) so a freed/soft-deleted email is never reused. `extraTaken` lets a BULK caller also avoid usernames
    // it has assigned earlier in the same batch but not yet saved (two same-name members would otherwise collide on
    // SaveChanges) — pass a running set and add each returned username to it.
    public static async Task<string> GenerateUniqueAsync(
        IApplicationDbContext context, string firstName, string lastName, string? fatherName, string domain,
        CancellationToken ct, ISet<string>? extraTaken = null)
    {
        async Task<bool> Taken(string e) =>
            (extraTaken?.Contains(e) ?? false) || await context.Users.AnyAsync(u => u.Email == e, ct);

        var fn = Normalize(firstName);
        var ln = Normalize(lastName);
        var email = $"{fn}.{ln}@{domain}";
        if (await Taken(email))
        {
            var fatherInitial = Normalize(fatherName ?? "").FirstOrDefault(char.IsLetter);
            var mid = fatherInitial != default ? $".{fatherInitial}" : "";
            email = $"{fn}{mid}.{ln}@{domain}";
            var suffix = 2;
            while (await Taken(email))
            {
                email = $"{fn}{mid}.{ln}{suffix}@{domain}";
                suffix++;
            }
        }
        return email;
    }
}
