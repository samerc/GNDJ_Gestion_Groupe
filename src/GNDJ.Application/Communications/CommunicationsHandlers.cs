using System.Security.Cryptography;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Communications;

// CG "Communications" tool: send a chosen email template to selected LEADERS (chefs). Reusable for the yearly
// rentrée onboarding (new vs returning chefs) and any mid-year announcement to the maîtrise. Deliberately
// leaders-only for now (not parents/all members — that's a bigger blast radius with its own concerns).
// "Leader" = a member with an active assignment on a maîtrise (leadership) functional role.

// One selectable recipient for the CG list.
public record LeaderRecipientDto(
    Guid MemberId,
    string FullName,
    string Units,          // the leader's active maîtrise unit(s), comma-joined
    string? ContactEmail,  // best real address (PrimaryContactEmail -> own -> guardian); null = nothing on file
    bool HasAccount,       // has a login
    bool HasLoggedIn);     // has ever logged in (drives the "nouveau chef" = never-logged-in segment)

// List leaders, optionally scoped to one unit and/or only those who have never logged in.
public record GetLeaderRecipientsQuery(Guid? UnitId = null, bool NeverLoggedInOnly = false)
    : IRequest<Result<IReadOnlyList<LeaderRecipientDto>>>;

public class GetLeaderRecipientsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetLeaderRecipientsQuery, Result<IReadOnlyList<LeaderRecipientDto>>>
{
    public async ValueTask<Result<IReadOnlyList<LeaderRecipientDto>>> Handle(GetLeaderRecipientsQuery request, CancellationToken ct)
    {
        // Group-wide leader roster (contact info) — restrict to a whole-group manager.
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<LeaderRecipientDto>>.Success([]);

        // Active assignments on a maîtrise role = the leaders. One member may lead several units → grouped below.
        var rows = await context.MemberAssignments
            .Where(a => a.EndDate == null && a.FunctionalRole.IsMaitrise)
            .Where(a => request.UnitId == null || a.UnitId == request.UnitId)
            .Select(a => new
            {
                a.MemberId,
                a.Member.FirstName,
                a.Member.LastName,
                a.Member.PrimaryContactEmail,
                UnitName = a.Unit.Name,
            })
            .ToListAsync(ct);

        if (rows.Count == 0) return Result<IReadOnlyList<LeaderRecipientDto>>.Success([]);

        var memberIds = rows.Select(r => r.MemberId).Distinct().ToList();

        // Login accounts (1:1 with member) for the has-account / has-logged-in flags.
        var users = await context.Users
            .Where(u => memberIds.Contains(u.MemberId))
            .Select(u => new { u.MemberId, u.LastLoginAt })
            .ToDictionaryAsync(u => u.MemberId, u => u.LastLoginAt, ct);

        var resolver = await ContactEmailResolver.LoadAsync(context, memberIds, ct);

        var result = rows
            .GroupBy(r => r.MemberId)
            .Select(g =>
            {
                var first = g.First();
                var units = string.Join(", ", g.Select(x => x.UnitName).Distinct().OrderBy(x => x));
                var hasAccount = users.TryGetValue(first.MemberId, out var lastLogin);
                return new LeaderRecipientDto(
                    first.MemberId,
                    $"{first.FirstName} {first.LastName}".Trim(),
                    units,
                    resolver.Resolve(first.MemberId, first.PrimaryContactEmail),
                    hasAccount,
                    hasAccount && lastLogin != null);
            })
            .Where(r => !request.NeverLoggedInOnly || !r.HasLoggedIn)
            .OrderBy(r => r.Units).ThenBy(r => r.FullName)
            .ToList();

        return Result<IReadOnlyList<LeaderRecipientDto>>.Success(result);
    }
}

// A sendable email template for the Communications page — enough to list + PREVIEW it (subject/body). Exposed
// on a maitrise.manage endpoint so a Chef de Groupe can pick + preview a template WITHOUT the super-admin-only
// /email/templates admin API (which needs associations.manage). Read-only: editing templates stays super-admin.
public record LeaderMessageTemplateDto(Guid Id, string Name, string Code, string Subject, string BodyHtml, string? Variables);

public record GetLeaderMessageTemplatesQuery() : IRequest<Result<IReadOnlyList<LeaderMessageTemplateDto>>>;

public class GetLeaderMessageTemplatesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetLeaderMessageTemplatesQuery, Result<IReadOnlyList<LeaderMessageTemplateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<LeaderMessageTemplateDto>>> Handle(GetLeaderMessageTemplatesQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<IReadOnlyList<LeaderMessageTemplateDto>>.Success([]);

        var list = await context.EmailTemplates
            .Where(t => t.IsActive)
            .OrderBy(t => t.Name)
            .Select(t => new LeaderMessageTemplateDto(t.Id, t.Name, t.Code, t.Subject, t.BodyHtml, t.Variables))
            .ToListAsync(ct);
        return Result<IReadOnlyList<LeaderMessageTemplateDto>>.Success(list);
    }
}

// Result of a send: how many were queued, who had no email, and (for an activation-link template) who has no
// login account yet — so the CG can chase those another way (an activation-link email is useless without an account).
public record SendLeaderMessageResult(
    int Sent, int NoEmail, IReadOnlyList<string> NoEmailNames, int NoAccount, IReadOnlyList<string> NoAccountNames);

// Send the given template to the selected leaders (by member id). Each recipient gets their own resolved
// contact email + per-recipient variables ({{leaderName}}, {{unitName}}, {{scoutYear}}, {{loginUrl}}).
public record SendLeaderMessageCommand(string TemplateCode, List<Guid> MemberIds)
    : IRequest<Result<SendLeaderMessageResult>>;

public class SendLeaderMessageCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendLeaderMessageCommand, Result<SendLeaderMessageResult>>
{
    public async ValueTask<Result<SendLeaderMessageResult>> Handle(SendLeaderMessageCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<SendLeaderMessageResult>.Failure("Action non autorisée.");
        if (string.IsNullOrWhiteSpace(request.TemplateCode))
            return Result<SendLeaderMessageResult>.Failure("Modèle d'email requis.");
        if (request.MemberIds is null || request.MemberIds.Count == 0)
            return Result<SendLeaderMessageResult>.Failure("Aucun destinataire sélectionné.");

        // Guard the template exists + is active (else every enqueued row would fail to send).
        var template = await context.EmailTemplates
            .FirstOrDefaultAsync(t => t.Code == request.TemplateCode && t.IsActive, ct);
        if (template is null)
            return Result<SendLeaderMessageResult>.Failure("Modèle d'email introuvable ou inactif.");

        var ids = request.MemberIds.Distinct().ToList();

        // Per-recipient data: name + their active maîtrise unit(s).
        var rows = await context.MemberAssignments
            .Where(a => a.EndDate == null && a.FunctionalRole.IsMaitrise && ids.Contains(a.MemberId))
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.PrimaryContactEmail, UnitName = a.Unit.Name })
            .ToListAsync(ct);

        var scoutYear = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";
        var loginUrl = (await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "http://localhost:5173").TrimEnd('/');

        var memberIds = rows.Select(r => r.MemberId).Distinct().ToList();
        var resolver = await ContactEmailResolver.LoadAsync(context, memberIds, ct);

        // If the chosen template embeds the activation link (e.g. the rentrée onboarding email), we ALSO stamp a
        // set-password token per recipient and provide {{username}}/{{activationLink}}/{{expiryDays}} — so ONE
        // email both onboards the chef AND lets them set their password (no separate "Envoyer les accès" pass).
        // A plain announcement template (no {{activationLink}}) behaves as before: no tokens, sent to anyone with
        // an email. A recipient with no active login account can't be given a link → reported as "no account".
        var needsActivation = template.BodyHtml.Contains("{{activationLink}}", StringComparison.OrdinalIgnoreCase)
            || template.Subject.Contains("{{activationLink}}", StringComparison.OrdinalIgnoreCase);

        Dictionary<Guid, User> userByMember = new();
        var activationExpiryDays = 30;
        DateTime expiry = default;
        if (needsActivation)
        {
            userByMember = (await context.Users.Where(u => memberIds.Contains(u.MemberId)).ToListAsync(ct))
                .ToDictionary(u => u.MemberId);
            activationExpiryDays = int.TryParse(await context.Settings.Where(s => s.Key == "member.activation_link_days").Select(s => s.Value).FirstOrDefaultAsync(ct), out var ad) && ad > 0 ? ad : 30;
            expiry = DateTime.UtcNow.AddDays(activationExpiryDays);
        }

        var jobs = new List<EmailJob>();
        var noEmailNames = new List<string>();
        var noAccountNames = new List<string>();
        foreach (var g in rows.GroupBy(r => r.MemberId))
        {
            var first = g.First();
            var name = $"{first.FirstName} {first.LastName}".Trim();
            var email = resolver.Resolve(first.MemberId, first.PrimaryContactEmail);
            if (string.IsNullOrWhiteSpace(email)) { noEmailNames.Add(name); continue; }
            var units = string.Join(", ", g.Select(x => x.UnitName).Distinct().OrderBy(x => x));
            var vars = new Dictionary<string, string>
            {
                ["leaderName"] = name,
                ["unitName"] = units,
                ["scoutYear"] = scoutYear,
                ["loginUrl"] = loginUrl,
            };

            if (needsActivation)
            {
                if (!userByMember.TryGetValue(first.MemberId, out var user) || !user.IsActive)
                {
                    noAccountNames.Add(name); continue; // can't hand out a set-password link without an account
                }
                // Reuse the reset-token fields (raw in DB, compared on redemption at /reset-password?setup=1).
                var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
                user.PasswordResetToken = token;
                user.PasswordResetTokenExpiry = expiry;
                vars["username"] = user.Email;
                vars["activationLink"] = $"{loginUrl}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}&setup=1";
                vars["expiryDays"] = activationExpiryDays.ToString();
            }

            jobs.Add(new EmailJob(request.TemplateCode, email!, vars));
        }

        // Persist the stamped tokens BEFORE queuing the mail, so a token always exists when the link is clicked.
        if (needsActivation) await context.SaveChangesAsync(ct);
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendLeaderMessage", "EmailTemplate", template.Id,
            newValues: new { template.Code, Sent = jobs.Count, NoEmail = noEmailNames.Count, NoAccount = noAccountNames.Count }, cancellationToken: ct);

        return Result<SendLeaderMessageResult>.Success(new SendLeaderMessageResult(
            jobs.Count, noEmailNames.Count, noEmailNames, noAccountNames.Count, noAccountNames));
    }
}
