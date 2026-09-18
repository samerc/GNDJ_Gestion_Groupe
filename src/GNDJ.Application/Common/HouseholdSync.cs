using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Keeps household-level data consistent across a CONFIRMED fratrie (members sharing a Member.SiblingGroupId).
// Editing one child's parents-situation or address set mirrors it onto the confirmed siblings, because those are
// properties of the shared household, not of the individual child. Scoped strictly to confirmed fratries (the CG
// controls who is grouped, via the Fratries page); a member with no group is left untouched. Parents/guardians are
// already SHARED records across a confirmed fratrie (the confirm step merges duplicates into one), so their edits
// propagate on their own — only these per-member fields need mirroring.
public static class HouseholdSync
{
    // Other members in the same confirmed fratrie (excludes the source; empty when the member has no group).
    private static async Task<List<Guid>> SiblingIdsAsync(IApplicationDbContext ctx, Guid memberId, CancellationToken ct)
    {
        var gid = await ctx.Members.Where(m => m.Id == memberId).Select(m => m.SiblingGroupId).FirstOrDefaultAsync(ct);
        if (gid is null) return [];
        return await ctx.Members.Where(m => m.SiblingGroupId == gid && m.Id != memberId).Select(m => m.Id).ToListAsync(ct);
    }

    // Copy a member's parents-situation onto their confirmed siblings. Call AFTER setting the source member's value
    // and BEFORE the handler's SaveChanges (this stages the sibling changes into the same transaction).
    public static async Task PropagateParentsSituationAsync(IApplicationDbContext ctx, Guid memberId, string? value, CancellationToken ct)
    {
        var ids = await SiblingIdsAsync(ctx, memberId, ct);
        if (ids.Count == 0) return;
        var siblings = await ctx.Members.Where(m => ids.Contains(m.Id)).ToListAsync(ct);
        foreach (var s in siblings)
            if (s.ParentsSituation != value) s.ParentsSituation = value; // skip no-ops to avoid needless writes
    }

    // Mirror a member's CURRENT address set onto their confirmed siblings (the household shares one address). Call
    // AFTER the source member's address mutation is persisted (it reads the persisted set) — it does its OWN
    // SaveChanges. Replaces each sibling's addresses with copies of the source's, which is the intended "shared
    // household address" behaviour for a confirmed fratrie. Idempotent: if the siblings already match, it no-ops
    // (so a member edit that didn't touch the address doesn't churn soft-deleted rows).
    public static async Task PropagateAddressesAsync(IApplicationDbContext ctx, Guid memberId, CancellationToken ct)
    {
        var ids = await SiblingIdsAsync(ctx, memberId, ct);
        if (ids.Count == 0) return;
        // Separated / divorced households have TWO homes → never mirror one child's address onto the others
        // (those are handled manually, per the CG's decision). Situation still syncs (PropagateParentsSituation);
        // only the address unification is skipped when the family isn't a single united household.
        var situation = await ctx.Members.Where(m => m.Id == memberId).Select(m => m.ParentsSituation).FirstOrDefaultAsync(ct);
        if (IsSeparatedOrDivorced(situation)) return;
        var source = await ctx.MemberAddresses.Where(a => a.MemberId == memberId).ToListAsync(ct);
        // Never mirror an EMPTY source onto the siblings: that would wipe every sibling's address (e.g. a youth
        // removing their own last address via Ma fiche would silently clear the whole fratrie). We only propagate
        // when the source member actually has address(es) to share; removing the last one leaves siblings as-is.
        if (source.Count == 0) return;
        var existing = await ctx.MemberAddresses.Where(a => ids.Contains(a.MemberId)).ToListAsync(ct);
        if (AlreadyMirrored(source, existing, ids.Count)) return;

        ctx.MemberAddresses.RemoveRange(existing); // soft-deleted by the interceptor
        foreach (var sib in ids)
            foreach (var s in source)
                ctx.MemberAddresses.Add(new MemberAddress
                {
                    MemberId = sib, Type = s.Type, Country = s.Country, City = s.City, Details = s.Details, IsPrimary = s.IsPrimary,
                });
        await ctx.SaveChangesAsync(ct);
    }

    // After a member completes the "Vérifiez vos coordonnées" review, carry the household-level choices onto their
    // confirmed siblings so a parent does it ONCE for the family, not once per child: marks each sibling's review
    // as done (stops the popup re-appearing), copies the chosen primary contact email where it's actually valid
    // for the sibling (own or a guardian's address), and mirrors each parent's décédé / contact-d'urgence flags
    // onto the sibling's matching parent — matched by NAME, so it works whether or not the duplicate parent records
    // were merged. (Situation is mirrored by PropagateParentsSituationAsync; a shared guardian's own contacts are
    // already shared.) Stages into the caller's transaction (no SaveChanges here) — call before the handler saves.
    public static async Task PropagateContactReviewAsync(
        IApplicationDbContext ctx, Guid memberId, string? primaryEmail,
        IReadOnlyList<(Guid GuardianId, bool IsDeceased, bool IsEmergency)> guardians, CancellationToken ct)
    {
        var ids = await SiblingIdsAsync(ctx, memberId, ct);
        if (ids.Count == 0) return;

        // Map each reviewed parent's flags to its normalized name, so we can find the matching parent on a sibling.
        var reviewedIds = guardians.Select(g => g.GuardianId).Distinct().ToList();
        var reviewedNames = (await ctx.Guardians.Where(g => reviewedIds.Contains(g.Id))
                .Select(g => new { g.Id, g.FirstName, g.LastName }).ToListAsync(ct))
            .ToDictionary(g => g.Id, g => TextNormalization.NormalizeKey($"{g.FirstName} {g.LastName}"));
        var flagByName = new Dictionary<string, (bool Dead, bool Urgent)>();
        foreach (var g in guardians)
            if (reviewedNames.TryGetValue(g.GuardianId, out var nm) && !string.IsNullOrEmpty(nm))
                flagByName[nm] = (g.IsDeceased, g.IsEmergency);

        var email = string.IsNullOrWhiteSpace(primaryEmail) ? null : primaryEmail.Trim();
        var lower = email?.ToLowerInvariant();
        var now = DateTime.UtcNow;

        var siblings = await ctx.Members.Where(m => ids.Contains(m.Id)).ToListAsync(ct);
        foreach (var sib in siblings)
        {
            sib.ContactReviewedAt = now; // family reviewed once → don't nag the sibling
            if (lower is not null)
            {
                var ownHas = await ctx.MemberEmails.AnyAsync(e => e.MemberId == sib.Id && !e.IsDeleted && e.Address.ToLower() == lower, ct);
                var has = ownHas || await ctx.GuardianEmails.AnyAsync(e => !e.IsDeleted && e.Address.ToLower() == lower
                    && ctx.GuardianLinks.Any(l => l.GuardianId == e.GuardianId && l.MemberId == sib.Id && !l.IsDeleted), ct);
                if (has) sib.PrimaryContactEmail = email;
            }
        }

        // Décédé (on the parent) + urgence (on the child's link) onto each sibling's matching parent, by name.
        if (flagByName.Count > 0)
        {
            var links = await ctx.GuardianLinks.Where(l => ids.Contains(l.MemberId) && !l.IsDeleted).ToListAsync(ct);
            var gids = links.Select(l => l.GuardianId).Distinct().ToList();
            var gById = (await ctx.Guardians.Where(g => gids.Contains(g.Id)).ToListAsync(ct)).ToDictionary(g => g.Id);
            foreach (var l in links)
            {
                if (!gById.TryGetValue(l.GuardianId, out var gd)) continue;
                var nm = TextNormalization.NormalizeKey($"{gd.FirstName} {gd.LastName}");
                if (!flagByName.TryGetValue(nm, out var f)) continue;
                l.IsEmergencyContact = f.Urgent;
                gd.IsDeceased = f.Dead;
            }
        }
    }

    // Parents' situation is "Séparés" / "Divorcés" (two homes) → skip household ADDRESS sync. Accent/case-insensitive.
    private static bool IsSeparatedOrDivorced(string? situation)
    {
        if (string.IsNullOrWhiteSpace(situation)) return false;
        var k = TextNormalization.RemoveDiacritics(situation).ToLowerInvariant();
        return k.Contains("separ") || k.Contains("divorc");
    }

    // True when every sibling already holds exactly the source's addresses (so nothing needs mirroring).
    private static bool AlreadyMirrored(List<MemberAddress> source, List<MemberAddress> existing, int siblingCount)
    {
        if (existing.Count != source.Count * siblingCount) return false;
        static string Key(MemberAddress a) => $"{a.Type}|{a.Country}|{a.City}|{a.Details}|{a.IsPrimary}";
        var srcKeys = source.Select(Key).OrderBy(k => k).ToList();
        foreach (var g in existing.GroupBy(a => a.MemberId))
            if (!g.Select(Key).OrderBy(k => k).SequenceEqual(srcKeys)) return false;
        return true;
    }
}
