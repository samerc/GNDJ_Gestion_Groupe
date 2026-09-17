using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Public;

// A contact-form sender sometimes types their MEMBER LOGIN USERNAME (the synthetic "prenom.nom@scouts.gndj")
// into the email field instead of a real address — so a reply would bounce. This resolves such a username to
// the member's real contact email (PrimaryContactEmail -> own -> guardian, via ContactEmailResolver). A normal
// email is returned unchanged; a username with no real email on file resolves to null (undeliverable, so the
// UI can warn instead of silently sending into the void).
public static class ContactReplyEmail
{
    // Resolve ONE sender email to a deliverable address (used by the reply handler). Returns:
    //  - the same email, when it's a normal address (not a synthetic login);
    //  - the member's real contact email, when the sender is a "@{user_domain}" login username;
    //  - null, when it's a login username with no real email on file (nothing deliverable).
    public static async Task<string?> ResolveAsync(IApplicationDbContext context, string? senderEmail, CancellationToken ct)
    {
        var email = senderEmail?.Trim();
        if (string.IsNullOrWhiteSpace(email)) return null;

        var domain = await UserDomainAsync(context, ct);
        if (!IsSyntheticLogin(email, domain)) return email; // a real address — reply straight to it

        // Find the member behind the synthetic login, then resolve their real contact email.
        var member = await context.Users
            .Where(u => u.Email.ToLower() == email.ToLower())
            .Select(u => new { u.MemberId, PrimaryContactEmail = u.Member!.PrimaryContactEmail })
            .FirstOrDefaultAsync(ct);
        if (member is null) return null; // unknown username — nothing deliverable

        var resolver = await ContactEmailResolver.LoadAsync(context, new List<Guid> { member.MemberId }, ct);
        var real = resolver.Resolve(member.MemberId, member.PrimaryContactEmail);
        // Never hand back another synthetic address (defensive — PrimaryContactEmail can't be one, but guard anyway).
        return IsSyntheticLogin(real, domain) ? null : real;
    }

    // Batch variant for the inbox list (page of ≤100). Returns input-email -> deliverable email (or null).
    // A non-synthetic sender maps to itself; a login username maps to the member's real email or null.
    public static async Task<Dictionary<string, string?>> ResolveManyAsync(
        IApplicationDbContext context, IEnumerable<string?> senderEmails, CancellationToken ct)
    {
        var domain = await UserDomainAsync(context, ct);
        var result = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var synthetic = new List<string>();
        foreach (var raw in senderEmails)
        {
            var email = raw?.Trim();
            if (string.IsNullOrWhiteSpace(email) || result.ContainsKey(email)) continue;
            if (IsSyntheticLogin(email, domain)) synthetic.Add(email);
            else result[email] = email; // real address — replies go straight to it
        }

        if (synthetic.Count > 0)
        {
            var lowered = synthetic.Select(e => e.ToLower()).ToList();
            var users = await context.Users
                .Where(u => lowered.Contains(u.Email.ToLower()))
                .Select(u => new { u.Email, u.MemberId, PrimaryContactEmail = u.Member!.PrimaryContactEmail })
                .ToListAsync(ct);
            var memberIds = users.Select(u => u.MemberId).Distinct().ToList();
            var resolver = memberIds.Count > 0 ? await ContactEmailResolver.LoadAsync(context, memberIds, ct) : null;
            var byEmail = users.ToDictionary(u => u.Email, u => u, StringComparer.OrdinalIgnoreCase);
            foreach (var email in synthetic)
            {
                string? real = null;
                if (resolver is not null && byEmail.TryGetValue(email, out var u))
                {
                    real = resolver.Resolve(u.MemberId, u.PrimaryContactEmail);
                    if (IsSyntheticLogin(real, domain)) real = null;
                }
                result[email] = real;
            }
        }
        return result;
    }

    private static async Task<string> UserDomainAsync(IApplicationDbContext context, CancellationToken ct)
        => await context.Settings.Where(s => s.Key == "user_domain").Select(s => s.Value).FirstOrDefaultAsync(ct)
           ?? "scouts.gndj";

    // True when the address is a member login username (ends with "@{user_domain}"), not a real email.
    private static bool IsSyntheticLogin(string? email, string domain)
        => !string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(domain)
           && email.Trim().EndsWith("@" + domain, StringComparison.OrdinalIgnoreCase);
}
