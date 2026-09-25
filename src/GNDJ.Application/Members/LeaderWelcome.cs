using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// "Bienvenue dans la maîtrise" — the automatic email a member gets the first time they hold a leadership role
// (any functional role with IsMaitrise: CU, ACU, aumônier, CG, ACG…). New chefs are already members with an
// account, so this is NOT an access/activation email: it tells them what changes and what to do (sign in with
// their usual account, check their contact email, read their guide, the rentrée list, install the app).
//
// Detection is periodic (LeaderWelcomeBackgroundService, hourly) instead of a hook in each handler, because a
// leadership role can be given from many places (member file, passage finalize, Maîtrises transfer, organizer
// board, change-request approval…). A member is due when they have an ACTIVE maîtrise assignment and
// Member.LeaderWelcomeSentAt is null. The marker is stamped even when nothing is sent (no email on file, or the
// template switched off) so a member is only ever considered once. Turn the email off by deactivating the
// "leader_welcome" template (Paramètres → Modèles d'email).
public static class LeaderWelcome
{
    public const string TemplateCode = "leader_welcome";
    private const int BatchSize = 200;

    public static async Task<int> RunAsync(IApplicationDbContext context, IEmailQueue emailQueue, CancellationToken ct)
    {
        // Each due member's most senior active leadership post (highest rank) → role + unit shown in the email.
        var due = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && a.FunctionalRole.IsMaitrise
                        && !a.Member.IsDeleted && a.Member.LeaderWelcomeSentAt == null)
            .Select(a => new { a.MemberId, a.FunctionalRole.Rank, RoleName = a.FunctionalRole.Name, UnitName = a.Unit.Name })
            .ToListAsync(ct);
        if (due.Count == 0) return 0;

        var posts = due.GroupBy(d => d.MemberId)
            .Select(g => g.OrderByDescending(d => d.Rank).First())
            .Take(BatchSize)
            .ToList();
        var ids = posts.Select(p => p.MemberId).ToList();

        var members = await context.Members.Where(m => ids.Contains(m.Id)).ToListAsync(ct);
        var sendEnabled = await context.EmailTemplates.AnyAsync(t => t.Code == TemplateCode && t.IsActive, ct);
        var resolver = await ContactEmailResolver.LoadAsync(context, ids, ct);
        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');
        var scoutYear = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";

        var jobs = new List<EmailJob>();
        var now = DateTime.UtcNow;
        foreach (var m in members)
        {
            m.LeaderWelcomeSentAt = now;
            if (!sendEnabled) continue;
            var email = resolver.Resolve(m.Id, m.PrimaryContactEmail);
            if (string.IsNullOrWhiteSpace(email)) continue;
            var post = posts.First(p => p.MemberId == m.Id);
            jobs.Add(new EmailJob(TemplateCode, email!, new Dictionary<string, string>
            {
                ["leaderName"] = m.FirstName,
                ["memberName"] = $"{m.FirstName} {m.LastName}".Trim(),
                ["roleName"] = post.RoleName,
                ["unitName"] = post.UnitName,
                ["scoutYear"] = scoutYear,
                ["loginUrl"] = baseUrl,
                ["aideUrl"] = $"{baseUrl}/aide",
                ["rentreeUrl"] = $"{baseUrl}/rentree",
            }));
        }

        // Marker + outbox rows in ONE save: a crash can't send the welcome twice.
        emailQueue.Stage(context, jobs);
        await context.SaveChangesAsync(ct);
        if (jobs.Count > 0) emailQueue.Wake();
        return jobs.Count;
    }
}
