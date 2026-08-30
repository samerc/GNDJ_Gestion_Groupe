using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// Live assignee resolution for rentrée tasks. A ROLE task always reflects the CURRENT active assignments,
// so a maîtrise placed at ANY time lands on their to-do list immediately — no manual "Responsables" refresh:
//   • a per-unit role task (fanned out per unit) belongs to that unit's whole maîtrise — every IsMaitrise
//     role, so the CU AND the ACU/assistants (who since the 2026-08-30 split hold the assistant-unite
//     profile, not chef-unite) AND the aumônier, etc.;
//   • a group-wide role task belongs to the holders of its security-profile code.
// A "members" task keeps its explicitly stored assignee ids (a CG hand-picked list).
// The stored AssigneeMemberIds snapshot (written at generate/refresh) is now just a cache/fallback for role
// tasks — the read + authz + reminder paths all resolve live so timing and the ACU split can't leave gaps.
public static class RentreeAssignees
{
    // One active assignment, flattened to what resolution needs (unit, member, its profile code + maîtrise flag).
    public readonly record struct Holder(Guid UnitId, Guid MemberId, string? ProfileCode, bool IsMaitrise);

    public static Task<List<Holder>> LoadHoldersAsync(IApplicationDbContext context, CancellationToken ct) =>
        context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new Holder(a.UnitId, a.MemberId, a.FunctionalRole.SecurityProfile.Code, a.FunctionalRole.IsMaitrise))
            .ToListAsync(ct);

    // The live set of member ids responsible for this task, given a snapshot of current holders.
    public static HashSet<Guid> Resolve(RentreeTask task, IReadOnlyCollection<Holder> holders)
    {
        if (task.AssigneeType != "role")
            return task.AssigneeMemberIds.ToHashSet();
        IEnumerable<Holder> matched = task.UnitId.HasValue
            ? holders.Where(h => h.UnitId == task.UnitId.Value && h.IsMaitrise)   // per-unit → the unit's maîtrise
            : holders.Where(h => h.ProfileCode == task.AssigneeRole);              // group-wide → the profile's holders
        return matched.Select(h => h.MemberId).ToHashSet();
    }
}
