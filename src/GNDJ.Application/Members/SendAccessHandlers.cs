using System.Security.Cryptography;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// "Envoyer les accès" — the launch rollout tool. Sends each member an ACTIVATION email: their login
// username + a one-click link to set their own password. It reuses the existing password-reset token
// fields on User with a long (~30-day) expiry so a busy parent has the whole rollout window to click.
// Meant to be run unit by unit (Maîtrise first, then each unit), and one-off to (re)send a single
// member's access if they never got / lost the email. NOTE: from the app we only know the email was
// QUEUED — actual delivery/bounces live in the SMTP provider's dashboard.

// One row of the "who can I send to" list for a unit.
public record AccessCandidateDto(
    Guid MemberId, string MemberName, string? Username,
    bool HasAccount, bool HasEmail, string? ContactEmail, DateTime? LastLoginAt);

// Shared target resolution for the whole-group "hors maîtrise" scope (used by the candidates list + the send).
static class AccessTargets
{
    // Every active member who does NOT hold ANY active maîtrise (leadership) role — the youth/regular members.
    // A member who is a youth in one unit AND a leader in another is excluded (they're a leader → the chefs email).
    public static async Task<List<Guid>> ActiveNonMaitriseMemberIdsAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var maitrise = context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && a.FunctionalRole.IsMaitrise)
            .Select(a => a.MemberId);
        return await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && !maitrise.Contains(a.MemberId))
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
    }
}

// AllNonMaitrise = the whole-group scope: every active member who does NOT hold a leadership (maîtrise) role —
// i.e. the youth/regular members, excluding CU/CG/ACU/ACG/… who get the "Emails aux chefs" onboarding instead.
// Group-manager only (it spans all units). Otherwise UnitId scopes to one unit (unit-leader can see their own).
public record GetAccessCandidatesQuery(Guid? UnitId, bool AllNonMaitrise = false) : IRequest<Result<IReadOnlyList<AccessCandidateDto>>>;

public class GetAccessCandidatesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetAccessCandidatesQuery, Result<IReadOnlyList<AccessCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<AccessCandidateDto>>> Handle(GetAccessCandidatesQuery request, CancellationToken ct)
    {
        List<Guid> memberIds;
        if (request.AllNonMaitrise)
        {
            // Whole-group scope → require a group manager (super-admin / CG / ACG); a unit leader can't fan out group-wide.
            if (!MemberAccess.IsGroupManager(currentUser))
                return Result<IReadOnlyList<AccessCandidateDto>>.Failure("Accès réservé au chef de groupe.");
            memberIds = await AccessTargets.ActiveNonMaitriseMemberIdsAsync(context, ct);
        }
        else
        {
            if (request.UnitId is not Guid unitId)
                return Result<IReadOnlyList<AccessCandidateDto>>.Failure("Précisez une unité.");
            // Unit-scoped: super-admin sees any unit; a leader only their authorized units.
            if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(unitId))
                return Result<IReadOnlyList<AccessCandidateDto>>.Failure("Accès non autorisé à cette unité.");

            memberIds = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && !a.IsDeleted && a.EndDate == null)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }

        if (memberIds.Count == 0)
            return Result<IReadOnlyList<AccessCandidateDto>>.Success(new List<AccessCandidateDto>());

        var members = await context.Members
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName, m.PrimaryContactEmail })
            .ToListAsync(ct);

        var users = await context.Users
            .Where(u => memberIds.Contains(u.MemberId))
            .Select(u => new { u.MemberId, u.Email, u.LastLoginAt, u.IsActive })
            .ToListAsync(ct);
        var userByMember = users.ToDictionary(u => u.MemberId);

        var resolver = await ContactEmailResolver.LoadAsync(context, memberIds, ct);

        var list = members
            .OrderBy(m => m.LastName).ThenBy(m => m.FirstName)
            .Select(m =>
            {
                userByMember.TryGetValue(m.Id, out var u);
                var email = resolver.Resolve(m.Id, m.PrimaryContactEmail);
                return new AccessCandidateDto(
                    m.Id, $"{m.FirstName} {m.LastName}".Trim(),
                    u?.Email, u != null && u.IsActive, !string.IsNullOrWhiteSpace(email), email, u?.LastLoginAt);
            })
            .ToList();

        return Result<IReadOnlyList<AccessCandidateDto>>.Success(list);
    }
}

// Per-member outcome of a send. Status: sent | no-email | no-account | skipped.
public record SendAccessItem(Guid MemberId, string MemberName, string Status, string? Email);
public record SendAccessResult(int Sent, int NoEmail, int NoAccount, int NoAccess, int Skipped, List<SendAccessItem> Details);

// Send access/re-inscription emails: either to every active member of UnitId, or to an explicit MemberIds list
// (used for the single-member "Renvoyer l'accès"). OnlyNeverLoggedIn skips members who already signed in.
// TemplateCode picks WHICH email (default = "account_activation", the with-link activation letter). The behaviour
// is template-driven: if the chosen template contains {{activationLink}}, we stamp a set-password token and send
// the link (first-time activation / new member); otherwise we send a link-free re-inscription letter (a RETURNING
// member who already has an account) with {{loginUrl}} instead. So next year the CG sends the with-link template
// to new members and the without-link one to returning members. Only the two re-inscription codes are allowed.
public record SendAccessEmailsCommand(Guid? UnitId, List<Guid>? MemberIds, bool OnlyNeverLoggedIn, string? TemplateCode = null, bool AllNonMaitrise = false) : IRequest<Result<SendAccessResult>>;

public class SendAccessEmailsCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendAccessEmailsCommand, Result<SendAccessResult>>
{
    // The only templates this rollout tool may send (guards against sending an arbitrary template to members).
    // reinscription_access = the launch re-inscription letter (with the set-password link + dynamic dates + the
    // CG signature); reinscription_returning = the link-free version for a later year.
    private static readonly HashSet<string> AllowedTemplates = new(StringComparer.OrdinalIgnoreCase)
        { "account_activation", "reinscription_returning", "reinscription_access" };

    // Month/day names for a culture-independent French long date ("dimanche 20 septembre 2026") — avoids any
    // dependency on fr-FR culture data being installed (or globalization-invariant mode) on the server.
    private static readonly string[] FrMonths = { "", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre" };
    private static readonly string[] FrDays = { "dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi" };
    private static string FrLongDate(string? iso) =>
        DateOnly.TryParseExact(iso, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d)
            ? $"{FrDays[(int)d.DayOfWeek]} {d.Day} {FrMonths[d.Month]} {d.Year}" : "";

    public async ValueTask<Result<SendAccessResult>> Handle(SendAccessEmailsCommand request, CancellationToken ct)
    {
        var templateCode = string.IsNullOrWhiteSpace(request.TemplateCode) ? "account_activation" : request.TemplateCode!.Trim();
        if (!AllowedTemplates.Contains(templateCode))
            return Result<SendAccessResult>.Failure("Modèle d'email non autorisé.");

        // ── Resolve the target member set + enforce unit-scoped access ──
        List<Guid> targetIds;
        int noAccess = 0;
        if (request.MemberIds is { Count: > 0 })
        {
            var requested = request.MemberIds.Distinct().ToList();
            targetIds = requested;
            if (!currentUser.IsSuperAdmin)
            {
                var authIds = currentUser.AuthorizedUnitIds;
                var allowed = await context.MemberAssignments
                    .Where(a => requested.Contains(a.MemberId) && !a.IsDeleted && a.EndDate == null && authIds.Contains(a.UnitId))
                    .Select(a => a.MemberId).Distinct().ToListAsync(ct);
                targetIds = requested.Where(allowed.Contains).ToList(); // silently drop out-of-scope ids
                noAccess = requested.Count - targetIds.Count;
            }
        }
        else if (request.AllNonMaitrise)
        {
            // Whole-group send to every active non-maîtrise member — group-manager only (spans all units).
            if (!MemberAccess.IsGroupManager(currentUser))
                return Result<SendAccessResult>.Failure("Accès réservé au chef de groupe.");
            targetIds = await AccessTargets.ActiveNonMaitriseMemberIdsAsync(context, ct);
        }
        else if (request.UnitId is Guid unitId)
        {
            if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(unitId))
                return Result<SendAccessResult>.Failure("Accès non autorisé à cette unité.");
            targetIds = await context.MemberAssignments
                .Where(a => a.UnitId == unitId && !a.IsDeleted && a.EndDate == null)
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        }
        else
        {
            return Result<SendAccessResult>.Failure("Précisez une unité ou une liste de membres.");
        }

        if (targetIds.Count == 0)
            return Result<SendAccessResult>.Success(new SendAccessResult(0, 0, 0, noAccess, 0, []));

        var members = await context.Members
            .Where(m => targetIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName, m.PrimaryContactEmail })
            .ToListAsync(ct);

        // Tracked User entities so we can stamp the activation token on each.
        var users = await context.Users.Where(u => targetIds.Contains(u.MemberId)).ToListAsync(ct);
        var userByMember = users.ToDictionary(u => u.MemberId);

        var resolver = await ContactEmailResolver.LoadAsync(context, targetIds, ct);
        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');
        // Activation-link validity is configurable (member.activation_link_days, default 30) — a long rollout
        // window so a busy parent has time to click.
        var activationExpiryDays = int.TryParse(await context.Settings.Where(s => s.Key == "member.activation_link_days").Select(s => s.Value).FirstOrDefaultAsync(ct), out var ad) && ad > 0 ? ad : 30;
        var scoutYear = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";

        // Dynamic dates for the re-inscription letter (all filled from settings — never hard-coded). Formatted
        // in French long form; empty when the setting isn't set. These are batch-level (same for everyone) so
        // compute once. Only the reinscription_access template references them; harmless for the other templates.
        var deadlineFr = FrLongDate(await context.Settings.Where(s => s.Key == "demande.submission_deadline").Select(s => s.Value).FirstOrDefaultAsync(ct));
        var firstMeetingFr = FrLongDate(await context.Settings.Where(s => s.Key == "passage.first_meeting_date").Select(s => s.Value).FirstOrDefaultAsync(ct));
        var todayFr = FrLongDate(LebanonClock.Today.ToString("yyyy-MM-dd"));

        // CG signature from the actual role holders (active Chef(taine) de Groupe), male before female — matching
        // the official letter (Chef de Groupe on the left / Cheftaine de Groupe on the right). Rendered in a
        // white-space:pre-line block in the template, so the newline between the two lines shows.
        var cgHolders = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.Code == "chef-de-groupe")
            .Select(a => new { a.Member.FirstName, a.Member.LastName, a.Member.Gender })
            .ToListAsync(ct);
        var sigLines = new List<string>();
        var cgMale = cgHolders.FirstOrDefault(h => h.Gender == "Masculin");
        var cgFemale = cgHolders.FirstOrDefault(h => h.Gender == "Féminin");
        if (cgMale is not null) sigLines.Add($"{cgMale.FirstName} {cgMale.LastName} — Chef de Groupe");
        if (cgFemale is not null) sigLines.Add($"{cgFemale.FirstName} {cgFemale.LastName} — Cheftaine de Groupe");
        foreach (var h in cgHolders.Where(h => h.Gender != "Masculin" && h.Gender != "Féminin"))
            sigLines.Add($"{h.FirstName} {h.LastName} — Chef(taine) de Groupe");
        var signatureCG = string.Join("\n", sigLines);

        // Whether the chosen template needs a set-password link (drives whether we stamp a token). Template-driven:
        // a CG can remove/add the {{activationLink}} in the editor and the behaviour follows.
        var tpl = await context.EmailTemplates.IgnoreQueryFilters()
            .Where(t => t.Code == templateCode)
            .Select(t => new { t.Subject, t.BodyHtml, t.IsActive, t.IsDeleted })
            .FirstOrDefaultAsync(ct);
        if (tpl is null || tpl.IsDeleted || !tpl.IsActive)
            return Result<SendAccessResult>.Failure("Le modèle d'email est introuvable ou inactif.");
        var needsLink = (tpl.BodyHtml + " " + tpl.Subject).Contains("{{activationLink}}");

        var details = new List<SendAccessItem>();
        var jobs = new List<EmailJob>();
        int sent = 0, noEmail = 0, noAccount = 0, skipped = 0;
        var expiry = DateTime.UtcNow.AddDays(activationExpiryDays);

        foreach (var m in members)
        {
            var name = $"{m.FirstName} {m.LastName}".Trim();
            if (!userByMember.TryGetValue(m.Id, out var user) || !user.IsActive)
            {
                noAccount++; details.Add(new(m.Id, name, "no-account", null)); continue;
            }
            if (request.OnlyNeverLoggedIn && user.LastLoginAt is not null)
            {
                skipped++; details.Add(new(m.Id, name, "skipped", null)); continue;
            }
            var email = resolver.Resolve(m.Id, m.PrimaryContactEmail);
            if (string.IsNullOrWhiteSpace(email))
            {
                noEmail++; details.Add(new(m.Id, name, "no-email", null)); continue;
            }

            var vars = new Dictionary<string, string>
            {
                ["memberName"] = name,
                ["username"] = user.Email,
                ["loginUrl"] = baseUrl,
                ["scoutYear"] = scoutYear,
                // Re-inscription letter (reinscription_access) — dynamic dates + CG signature (unused by the others).
                ["dateDuJour"] = todayFr,
                ["dateLimiteReinscription"] = deadlineFr,
                ["datePremiereReunion"] = firstMeetingFr,
                ["signatureCG"] = signatureCG,
            };

            if (needsLink)
            {
                // Reuse the reset-token fields (raw in DB, compared on redemption at /reset-password).
                var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
                user.PasswordResetToken = token;
                user.PasswordResetTokenExpiry = expiry;
                // setup=1 switches the reset page copy to "activation" wording (first-time password set).
                vars["activationLink"] = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}&setup=1";
                vars["expiryDays"] = activationExpiryDays.ToString();
            }
            // A link-free re-inscription letter (returning member) needs no token — they log in with their
            // existing account; {{loginUrl}} points them at the sign-in page.

            jobs.Add(new EmailJob(templateCode, email!, vars));
            sent++; details.Add(new(m.Id, name, "sent", email));
        }

        // Persist the tokens, THEN queue the mail (so a token always exists when the link is clicked).
        await context.SaveChangesAsync(ct);
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendAccess", "Member", null,
            newValues: new { sent, noEmail, noAccount, skipped, unit = request.UnitId, template = templateCode }, cancellationToken: ct);

        return Result<SendAccessResult>.Success(new SendAccessResult(sent, noEmail, noAccount, noAccess, skipped, details));
    }
}
