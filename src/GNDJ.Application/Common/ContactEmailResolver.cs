using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Batched member-contact-email resolver: PrimaryContactEmail -> member's own (primary first) -> a
// guardian's (primary first). Loaded once for a set of members via LoadAsync; Resolve(...) is then
// purely in-memory (no N+1). Shared by the "send access" rollout, single-member reset, and any other
// member-facing mail that needs one best address. (The cotisation dashboard has its own superset
// resolver that also returns phone + parent name; single-recipient reset requests fan out to ALL
// addresses instead of one, so both intentionally keep their own logic.)
public sealed class ContactEmailResolver
{
    private readonly ILookup<Guid, (string Address, bool IsPrimary)> _own;
    private readonly Dictionary<Guid, List<Guid>> _memberGuardians;
    private readonly ILookup<Guid, (string Address, bool IsPrimary)> _guardian;

    private ContactEmailResolver(
        ILookup<Guid, (string, bool)> own,
        Dictionary<Guid, List<Guid>> memberGuardians,
        ILookup<Guid, (string, bool)> guardian)
    {
        _own = own;
        _memberGuardians = memberGuardians;
        _guardian = guardian;
    }

    public static async Task<ContactEmailResolver> LoadAsync(IApplicationDbContext context, List<Guid> memberIds, CancellationToken ct)
    {
        var own = (await context.MemberEmails
            .Where(e => memberIds.Contains(e.MemberId) && !e.IsDeleted)
            .Select(e => new { e.MemberId, e.Address, e.IsPrimary }).ToListAsync(ct))
            .ToLookup(e => e.MemberId, e => (e.Address, e.IsPrimary));

        var links = await context.GuardianLinks
            .Where(l => memberIds.Contains(l.MemberId) && !l.IsDeleted)
            .Select(l => new { l.MemberId, l.GuardianId }).ToListAsync(ct);
        var memberGuardians = links.GroupBy(l => l.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.GuardianId).Distinct().ToList());
        var guardianIds = links.Select(l => l.GuardianId).Distinct().ToList();

        var guardian = (await context.GuardianEmails
            .Where(e => guardianIds.Contains(e.GuardianId) && !e.IsDeleted)
            .Select(e => new { e.GuardianId, e.Address, e.IsPrimary }).ToListAsync(ct))
            .ToLookup(e => e.GuardianId, e => (e.Address, e.IsPrimary));

        return new ContactEmailResolver(own, memberGuardians, guardian);
    }

    public string? Resolve(Guid memberId, string? primaryContact)
    {
        if (!string.IsNullOrWhiteSpace(primaryContact)) return primaryContact;

        var ownAddr = _own[memberId].OrderByDescending(e => e.IsPrimary)
            .Select(e => e.Address).FirstOrDefault(a => !string.IsNullOrWhiteSpace(a));
        if (!string.IsNullOrWhiteSpace(ownAddr)) return ownAddr;

        if (_memberGuardians.TryGetValue(memberId, out var gids))
            foreach (var gid in gids)
            {
                var addr = _guardian[gid].OrderByDescending(e => e.IsPrimary)
                    .Select(e => e.Address).FirstOrDefault(a => !string.IsNullOrWhiteSpace(a));
                if (!string.IsNullOrWhiteSpace(addr)) return addr;
            }
        return null;
    }
}
