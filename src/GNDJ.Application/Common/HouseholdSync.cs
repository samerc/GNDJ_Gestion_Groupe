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
        var source = await ctx.MemberAddresses.Where(a => a.MemberId == memberId).ToListAsync(ct);
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
