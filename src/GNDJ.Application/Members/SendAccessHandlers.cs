using System.Security.Cryptography;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// "Envoyer l'accès" (member file → Actions): sends ONE member (or a few) their ACTIVATION email — their login
// username + a one-click link to set their own password (template account_activation). It reuses the password-
// reset token fields on User with a long expiry (member.activation_link_days, default 30).
// Used for the rare cases where someone didn't get the automatic email: a member created by hand (accepted without
// a demande), an account created by "Comptes manquants", or a lost / expired email. The old bulk "Envoyer les
// accès" page (the 2026 launch rollout, unit by unit) was removed: every existing member has their access now, and
// new members get their link automatically when their demande is converted.
// NOTE: the app only knows the email was QUEUED — delivery/bounces live in the provider's dashboard.

// Per-member outcome of a send. Status: sent | no-email | no-account.
public record SendAccessItem(Guid MemberId, string MemberName, string Status, string? Email);
public record SendAccessResult(int Sent, int NoEmail, int NoAccount, int NoAccess, List<SendAccessItem> Details);

public record SendAccessEmailsCommand(List<Guid> MemberIds) : IRequest<Result<SendAccessResult>>;

public class SendAccessEmailsCommandValidator : AbstractValidator<SendAccessEmailsCommand>
{
    public SendAccessEmailsCommandValidator()
    {
        RuleFor(x => x.MemberIds).NotEmpty().WithMessage("Précisez au moins un membre.")
            .Must(l => l.Count <= 50).WithMessage("50 membres au maximum.");
    }
}

public class SendAccessEmailsCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendAccessEmailsCommand, Result<SendAccessResult>>
{
    private const string TemplateCode = "account_activation";

    public async ValueTask<Result<SendAccessResult>> Handle(SendAccessEmailsCommand request, CancellationToken ct)
    {
        // ── Resolve the target members + enforce access (same reach as editing the member) ──
        var requested = request.MemberIds.Distinct().ToList();
        var targetIds = new List<Guid>();
        foreach (var id in requested)
            if (await MemberAccess.CanAccessMemberAsync(context, currentUser, id, ct)) targetIds.Add(id);
        var noAccess = requested.Count - targetIds.Count;
        if (targetIds.Count == 0)
            return noAccess > 0
                ? Result<SendAccessResult>.Failure("Accès non autorisé à ce membre.")
                : Result<SendAccessResult>.Success(new SendAccessResult(0, 0, 0, 0, []));

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
        var expiryDays = int.TryParse(await context.Settings.Where(s => s.Key == "member.activation_link_days").Select(s => s.Value).FirstOrDefaultAsync(ct), out var ad) && ad > 0 ? ad : 30;

        var active = await context.EmailTemplates
            .AnyAsync(t => t.Code == TemplateCode && t.IsActive, ct);
        if (!active) return Result<SendAccessResult>.Failure("Le modèle d'email « Activation du compte » est introuvable ou inactif.");

        var details = new List<SendAccessItem>();
        var jobs = new List<EmailJob>();
        int sent = 0, noEmail = 0, noAccount = 0;
        var expiry = DateTime.UtcNow.AddDays(expiryDays);

        foreach (var m in members)
        {
            var name = $"{m.FirstName} {m.LastName}".Trim();
            if (!userByMember.TryGetValue(m.Id, out var user) || !user.IsActive)
            {
                noAccount++; details.Add(new(m.Id, name, "no-account", null)); continue;
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
            jobs.Add(new EmailJob(TemplateCode, email!, new Dictionary<string, string>
            {
                ["memberName"] = name,
                ["username"] = user.Email,
                // setup=1 switches the reset page copy to "activation" wording (first-time password set).
                ["activationLink"] = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}&setup=1",
                ["expiryDays"] = expiryDays.ToString(),
            }));
            sent++; details.Add(new(m.Id, name, "sent", email));
        }

        // Persist the tokens, THEN queue the mail (so a token always exists when the link is clicked).
        await context.SaveChangesAsync(ct);
        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendAccess", "Member", targetIds.Count == 1 ? targetIds[0] : null,
            newValues: new { sent, noEmail, noAccount, Members = await AuditNames.MembersAsync(context, targetIds, ct) }, cancellationToken: ct);

        return Result<SendAccessResult>.Success(new SendAccessResult(sent, noEmail, noAccount, noAccess, details));
    }
}
