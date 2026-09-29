using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// A unit has one chef d'unité (and the group one chef de groupe): giving someone a head function — a role whose
// security profile is chef-unite / chef-de-groupe — ends the current holder's head function in that unit. Used by
// every path that gives a function right away (member Postes create/edit, Maîtrises "maintenant"). The planned path
// (next year's maîtrise plan) does the same at planning time (Maitrises.HeadSwap).
public static class HeadReplacement
{
    public static readonly string[] HeadProfiles = ["chef-unite", "chef-de-groupe"];

    public static Task<bool> IsHeadRoleAsync(IApplicationDbContext context, Guid roleId, CancellationToken ct)
        => context.FunctionalRoles.AnyAsync(r => r.Id == roleId && HeadProfiles.Contains(r.SecurityProfile.Code), ct);

    // Ends (tracked, caller saves) the other members' active head functions in the unit, the day the new head starts
    // (today when that day isn't after the old head's own start). Returns their names for the audit / a message.
    public static async Task<List<string>> EndOtherHeadsAsync(IApplicationDbContext context, Guid unitId, Guid roleId,
        Guid newHeadMemberId, DateOnly newHeadStart, CancellationToken ct)
    {
        if (!await IsHeadRoleAsync(context, roleId, ct)) return [];
        var others = await context.MemberAssignments
            .Include(a => a.Member)
            .Where(a => a.UnitId == unitId && a.EndDate == null && a.MemberId != newHeadMemberId
                && HeadProfiles.Contains(a.FunctionalRole.SecurityProfile.Code))
            .ToListAsync(ct);
        var today = LebanonClock.Today;
        foreach (var a in others)
            a.EndDate = newHeadStart > a.StartDate ? newHeadStart : (today > a.StartDate ? today : a.StartDate.AddDays(1));
        return others.Select(a => $"{a.Member.FirstName} {a.Member.LastName}").ToList();
    }
}
