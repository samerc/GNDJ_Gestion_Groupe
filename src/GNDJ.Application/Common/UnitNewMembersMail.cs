using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// "Tell each receiving unit's chef(s) d'unité who joined": shared by the demande responses (new enrollments)
// and the passage posting (members moving in from another unit). One email per CU with a throw-away Excel of
// the newcomers (deleted by the outbox sender once that email is sent).
public static class UnitNewMembersMail
{
    public sealed record Recipient(Guid MemberId, string Name, string Email);

    // Unit HEADS (role on the chef-unite profile — assistants are on assistant-unite) of the given units with a
    // reachable contact email, keyed by unit. A unit without one is simply absent from the result.
    public static async Task<Dictionary<Guid, List<Recipient>>> LoadUnitHeadsAsync(IApplicationDbContext context, IReadOnlyCollection<Guid> unitIds, CancellationToken ct)
    {
        var cus = await context.MemberAssignments
            .Where(a => unitIds.Contains(a.UnitId) && a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted
                        && a.FunctionalRole.SecurityProfile.Code == "chef-unite")
            .Select(a => new { a.UnitId, a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.PrimaryContactEmail })
            .ToListAsync(ct);
        var resolver = await ContactEmailResolver.LoadAsync(context, cus.Select(c => c.MemberId).Distinct().ToList(), ct);
        return cus
            .Select(c => new { c.UnitId, R = new Recipient(c.MemberId, $"{c.FirstName} {c.LastName}".Trim(), resolver.Resolve(c.MemberId, c.PrimaryContactEmail) ?? "") })
            .Where(x => !string.IsNullOrWhiteSpace(x.R.Email))
            .GroupBy(x => x.UnitId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.R).DistinctBy(r => r.Email.ToLowerInvariant()).ToList());
    }

    // One email job per recipient, each with its own copy of the Excel (DeleteAfterSend).
    public static List<EmailJob> BuildJobs(string templateCode, string unitName, string scoutYear,
        IReadOnlyList<NewMemberSheetRow> rows, IEnumerable<Recipient> recipients, IUnitNewMembersSheet sheet)
    {
        var jobs = new List<EmailJob>();
        foreach (var cu in recipients)
        {
            var attachment = new EmailAttachment($"Nouveaux membres - {unitName}.xlsx", sheet.Save(unitName, scoutYear, rows), DeleteAfterSend: true);
            jobs.Add(new EmailJob(templateCode, cu.Email, new Dictionary<string, string>
            {
                ["leaderName"] = cu.Name,
                ["unitName"] = unitName,
                ["count"] = rows.Count.ToString(),
                ["scoutYear"] = scoutYear,
            }, [attachment]));
        }
        return jobs;
    }

    // Leaders of a unit (CU + assistants = active roles granting members.edit) — the people told about a CG
    // change on the unit's passage.
    public static Task<List<Guid>> UnitLeaderIdsAsync(IApplicationDbContext context, Guid unitId, CancellationToken ct) =>
        context.MemberAssignments
            .Where(a => a.UnitId == unitId && a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted
                        && a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == GNDJ.Domain.Enums.Permissions.MembersEdit))
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
}
