using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// Shared helper to DECLARE (or extend) a confirmed fratrie for a set of members — reused wherever the app
// establishes a true sibling link automatically (e.g. demande conversion, where a proche auto-matched to an
// existing member + the household's guardians are shared → the converted child and that member are siblings).
// Mirrors the approve/link commands' group-resolution: reuse/merge any existing group among the members, else
// create one; set SiblingGroupId on all; drop any "not siblings" tombstones among them.
public static class SiblingDeclare
{
    // Ensure the given members share ONE SiblingGroup. Pass the actual tracked Member entities (so newly-created,
    // not-yet-saved members work too). Stages into the caller's transaction — no SaveChanges here. `noteIfNew`
    // is stored on a group only when a brand-new one is created (CG-only note; ignored when extending).
    public static async Task EnsureGroupAsync(IApplicationDbContext context, IReadOnlyList<Member> members, string? noteIfNew, CancellationToken ct)
    {
        var distinct = members.Where(m => m is not null).DistinctBy(m => m.Id).ToList();
        if (distinct.Count < 2) return; // nothing to group

        var existing = distinct.Where(m => m.SiblingGroupId != null).Select(m => m.SiblingGroupId!.Value).Distinct().ToList();
        Guid groupId;
        if (existing.Count > 0)
        {
            groupId = existing[0];
            if (existing.Count > 1)
            {
                // Merge the other groups into the first (move their members, drop the emptied groups).
                var others = existing.Skip(1).ToList();
                var toMove = await context.Members.Where(m => m.SiblingGroupId != null && others.Contains(m.SiblingGroupId!.Value)).ToListAsync(ct);
                foreach (var m in toMove) m.SiblingGroupId = groupId;
                var emptied = await context.SiblingGroups.Where(g => others.Contains(g.Id)).ToListAsync(ct);
                context.SiblingGroups.RemoveRange(emptied);
            }
        }
        else
        {
            var group = new SiblingGroup { Notes = noteIfNew };
            context.SiblingGroups.Add(group);
            groupId = group.Id;
        }
        foreach (var m in distinct) m.SiblingGroupId = groupId;

        // They're confirmed siblings now → drop any "not siblings" tombstones among them.
        var ids = distinct.Select(m => m.Id).ToList();
        var tombstones = await context.SiblingRejections
            .Where(r => ids.Contains(r.MemberAId) && ids.Contains(r.MemberBId)).ToListAsync(ct);
        if (tombstones.Count > 0) context.SiblingRejections.RemoveRange(tombstones);
    }
}
