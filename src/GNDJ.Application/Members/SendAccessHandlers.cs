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

public record GetAccessCandidatesQuery(Guid UnitId) : IRequest<Result<IReadOnlyList<AccessCandidateDto>>>;

public class GetAccessCandidatesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetAccessCandidatesQuery, Result<IReadOnlyList<AccessCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<AccessCandidateDto>>> Handle(GetAccessCandidatesQuery request, CancellationToken ct)
    {
        // Unit-scoped: super-admin sees any unit; a leader only their authorized units.
        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<IReadOnlyList<AccessCandidateDto>>.Failure("Accès non autorisé à cette unité.");

        var memberIds = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && !a.IsDeleted && a.EndDate == null)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);

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

// Send activation emails: either to every active member of UnitId, or to an explicit MemberIds list
// (used for the single-member "Renvoyer l'accès"). OnlyNeverLoggedIn skips members who already signed in.
public record SendAccessEmailsCommand(Guid? UnitId, List<Guid>? MemberIds, bool OnlyNeverLoggedIn) : IRequest<Result<SendAccessResult>>;

public class SendAccessEmailsCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendAccessEmailsCommand, Result<SendAccessResult>>
{
    private const int ActivationExpiryDays = 30; // long rollout window so a busy parent has time to click

    public async ValueTask<Result<SendAccessResult>> Handle(SendAccessEmailsCommand request, CancellationToken ct)
    {
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

        var details = new List<SendAccessItem>();
        var jobs = new List<EmailJob>();
        int sent = 0, noEmail = 0, noAccount = 0, skipped = 0;
        var expiry = DateTime.UtcNow.AddDays(ActivationExpiryDays);

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

            // Reuse the reset-token fields (raw in DB, compared on redemption at /reset-password).
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
            user.PasswordResetToken = token;
            user.PasswordResetTokenExpiry = expiry;

            // setup=1 switches the reset page copy to "activation" wording (first-time password set).
            var link = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}&setup=1";
            jobs.Add(new EmailJob("account_activation", email!, new Dictionary<string, string>
            {
                ["memberName"] = name,
                ["username"] = user.Email,
                ["activationLink"] = link,
                ["expiryDays"] = ActivationExpiryDays.ToString(),
            }));
            sent++; details.Add(new(m.Id, name, "sent", email));
        }

        // Persist the tokens, THEN queue the mail (so a token always exists when the link is clicked).
        await context.SaveChangesAsync(ct);
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendAccess", "Member", null,
            newValues: new { sent, noEmail, noAccount, skipped, unit = request.UnitId }, cancellationToken: ct);

        return Result<SendAccessResult>.Success(new SendAccessResult(sent, noEmail, noAccount, noAccess, skipped, details));
    }
}
