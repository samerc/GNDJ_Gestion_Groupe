using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.LoginCode;

// Passwordless login — step 1: "Se connecter avec un code". The submitted value is the account USERNAME
// (the synthetic prenom.nom@scouts.gndj identifier parents have memorized), NOT a real inbox. We resolve the
// account's MAIN contact email (PrimaryContactEmail → own → guardian, via ContactEmailResolver — the same
// inbox that already receives reset/activation mail) and email a 6-digit single-use code THERE (one address
// only, never a fan-out). The response reports whether the account exists + a MASKED hint of where the code
// went. Keeping the username as the identifier means "any email on file" only decides WHERE the code goes,
// never WHICH child's account — so there's no which-child ambiguity and sibling behavior is unchanged.
// Small enumeration tradeoff accepted (a masked email confirms a username exists): a username is predictable
// and grants nothing without the code, which lands in an inbox the requester must control.
public record RequestLoginCodeCommand(string Username) : IRequest<Result<LoginCodeRequestResult>>;

// Found = a matching active account exists. HasEmail = it has a main contact email a code could be sent to.
// MaskedEmail = a partly-revealed hint (e.g. "sam***@gm***.com") when a code was sent, else null.
public record LoginCodeRequestResult(bool Found, bool HasEmail, string? MaskedEmail);

public class RequestLoginCodeCommandValidator : AbstractValidator<RequestLoginCodeCommand>
{
    public RequestLoginCodeCommandValidator()
        => RuleFor(x => x.Username).NotEmpty().WithMessage("Le nom d'utilisateur est requis.").MaximumLength(254);
}

public class RequestLoginCodeCommandHandler(IApplicationDbContext context, IEmailQueue emailQueue, IPasswordHasher hasher)
    : IRequestHandler<RequestLoginCodeCommand, Result<LoginCodeRequestResult>>
{
    public async ValueTask<Result<LoginCodeRequestResult>> Handle(RequestLoginCodeCommand request, CancellationToken ct)
    {
        // Match the username like member Login: trimmed + case-insensitive (mobile auto-capitalises / adds a space).
        var username = (request.Username ?? "").Trim().ToLowerInvariant();
        var user = await context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == username && u.IsActive, ct);

        if (user is null || user.Member is null)
            return Result<LoginCodeRequestResult>.Success(new LoginCodeRequestResult(false, false, null));

        // Resolve the ONE main contact email (same resolver used by reset/activation mail).
        var resolver = await ContactEmailResolver.LoadAsync(context, [user.MemberId], ct);
        var email = resolver.Resolve(user.MemberId, user.Member.PrimaryContactEmail);
        if (string.IsNullOrWhiteSpace(email))
            return Result<LoginCodeRequestResult>.Success(new LoginCodeRequestResult(true, false, null)); // no email on file

        // Generate + store a hashed single-use code (15-min expiry). SHA-256 (HashToken) is fine — a 6-digit
        // code is low-entropy, but it's single-use, short-lived and rate-limited, and never stored in clear.
        var code = Random.Shared.Next(100000, 999999).ToString();
        user.LoginCode = hasher.HashToken(code);
        user.LoginCodeExpiry = DateTime.UtcNow.AddMinutes(15);
        await context.SaveChangesAsync(ct);

        await emailQueue.EnqueueAsync(new EmailJob("login_code", email, new Dictionary<string, string>
        {
            ["memberName"] = $"{user.Member.FirstName} {user.Member.LastName}".Trim(),
            ["code"] = code,
        }), ct);

        return Result<LoginCodeRequestResult>.Success(new LoginCodeRequestResult(true, true, MaskEmail(email)));
    }

    // Reveals a FEW characters (product ask: more than the 1-char reset mask): up to 3 of the local part and 2
    // of the domain name, keeping the TLD. e.g. "samer@gmail.com" → "sam***@gm***.com"; "a@x.io" → "a***@x***.io".
    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0 || at == email.Length - 1) return "***";
        var local = email[..at];
        var domain = email[(at + 1)..];
        var head = local.Length <= 3 ? local : local[..3];

        var dot = domain.LastIndexOf('.');
        if (dot <= 0)
        {
            var dHead = domain.Length <= 2 ? domain : domain[..2];
            return $"{head}***@{dHead}***";
        }
        var name = domain[..dot];
        var tld = domain[dot..]; // includes the leading dot
        var nHead = name.Length <= 2 ? name : name[..2];
        return $"{head}***@{nHead}***{tld}";
    }
}
