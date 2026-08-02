using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace GNDJ.Application.Auth.Commands.RequestPasswordReset;

// Starts the "forgot password" flow. The submitted value is the account USERNAME (imported/converted
// members log in with a synthetic firstname.lastname@scouts.gndj identifier — never a real inbox), so
// the reset LINK is emailed to the member's real contact address(es), resolved below, NOT to the username.
public record RequestPasswordResetCommand(string Email) : IRequest<Result<ForgotPasswordResult>>;

// Outcome shown to the user: whether the account was found, and the masked address(es) the link was sent to.
// (Deliberately NOT anti-enumeration — this is an internal group tool where confirming the account/target
// is more useful than hiding existence; the product owner asked for an explicit found / not-found message.)
public record ForgotPasswordResult(bool Found, List<string> SentTo);

public class RequestPasswordResetCommandValidator : AbstractValidator<RequestPasswordResetCommand>
{
    public RequestPasswordResetCommandValidator()
        => RuleFor(x => x.Email).NotEmpty().WithMessage("Le nom d'utilisateur est requis.")
            .EmailAddress().WithMessage("Le nom d'utilisateur est invalide.").MaximumLength(254);
}

public class RequestPasswordResetCommandHandler(
    IApplicationDbContext context,
    IEmailQueue emailQueue
) : IRequestHandler<RequestPasswordResetCommand, Result<ForgotPasswordResult>>
{
    public async ValueTask<Result<ForgotPasswordResult>> Handle(RequestPasswordResetCommand request, CancellationToken ct)
    {
        var user = await context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, ct);

        // Account not found (or inactive) — tell the caller plainly.
        if (user is null)
            return Result<ForgotPasswordResult>.Success(new ForgotPasswordResult(false, []));

        // Generate a secure token
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "").Replace("/", "").Replace("=", "");

        user.PasswordResetToken = token;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);

        await context.SaveChangesAsync(ct);

        // Resolve where to actually deliver the link: the designated primary contact email if set,
        // otherwise EVERY email on file (member's own + all linked guardians'). A parent's address can be
        // shared across siblings, so we key the flow on the username and just fan the link out to the file.
        var recipients = await ResolveRecipientsAsync(user.MemberId, user.Member?.PrimaryContactEmail, ct);

        // Queue the link email(s) (sent in the background — the reset URL still carries the USERNAME so
        // ResetPassword matches on User.Email). Queuing keeps the SMTP round-trip(s) off the request path.
        var baseUrl = await context.Settings
            .Where(s => s.Key == "app.base_url")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct) ?? "http://localhost:5173";
        var resetLink = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(request.Email)}";
        var vars = new Dictionary<string, string>
        {
            ["memberName"] = user.Member?.FirstName ?? "Utilisateur",
            ["resetLink"] = resetLink,
            ["expiryHours"] = "1"
        };
        await emailQueue.EnqueueManyAsync(
            recipients.Select(to => new EmailJob("password_reset", to, vars)), ct);

        // Account found — report the masked address(es) the link was sent to (empty if none on file).
        return Result<ForgotPasswordResult>.Success(
            new ForgotPasswordResult(true, recipients.Select(MaskEmail).ToList()));
    }

    // Masks an email for display: keeps the first local char + the full domain, e.g.
    // "samer@fancyshark.com" → "s***@fancyshark.com". Confirms delivery target without fully exposing it.
    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return "***";
        var local = email[..at];
        var domain = email[at..];
        var head = local.Length <= 1 ? local : local[0].ToString();
        return $"{head}***{domain}";
    }

    // Delivery targets for the reset link: [PrimaryContactEmail] if set, else the distinct union of the
    // member's own emails + all linked guardians' emails. Empty means the member has no email on file
    // (they must ask a leader for an admin reset). Deduped accent/case-insensitively is overkill here —
    // a plain case-insensitive distinct is enough since these are exact stored addresses.
    private async Task<List<string>> ResolveRecipientsAsync(Guid memberId, string? primary, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(primary))
            return [primary];

        var own = await context.MemberEmails
            .Where(e => e.MemberId == memberId && !e.IsDeleted)
            .Select(e => e.Address).ToListAsync(ct);
        var guardian = await context.GuardianEmails
            .Where(e => !e.IsDeleted && e.Guardian.Links.Any(l => l.MemberId == memberId && !l.IsDeleted))
            .Select(e => e.Address).ToListAsync(ct);

        return own.Concat(guardian)
            .Where(a => !string.IsNullOrWhiteSpace(a))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
