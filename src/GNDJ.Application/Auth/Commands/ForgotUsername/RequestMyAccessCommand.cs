using System.Security.Cryptography;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.ForgotUsername;

// "Identifiant oublié" — self-service access recovery. A member/parent enters an email that is ON FILE for
// them (their own email, a linked guardian's email, or their primary contact email); we email THAT SAME
// address each matching account's username + a one-click set-password link (reuses the account_activation
// template with a 7-day token). The email being on file is the proof of ownership — the link only reaches
// someone who controls that inbox — so the endpoint always returns a generic success (no account enumeration).
// One family email can match several accounts (a parent's children); each gets its own clearly-named email.
public record RequestMyAccessCommand(string Email) : IRequest<Result<bool>>;

public class RequestMyAccessCommandValidator : AbstractValidator<RequestMyAccessCommand>
{
    public RequestMyAccessCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'adresse email est requise.")
            .EmailAddress().WithMessage("Adresse email invalide.")
            .MaximumLength(256);
    }
}

public class RequestMyAccessCommandHandler(IApplicationDbContext context, IEmailQueue emailQueue)
    : IRequestHandler<RequestMyAccessCommand, Result<bool>>
{
    private const int ExpiryDays = 7; // on-demand link — shorter window than the CG bulk rollout (30d)

    public async ValueTask<Result<bool>> Handle(RequestMyAccessCommand request, CancellationToken ct)
    {
        var lower = request.Email.Trim().ToLowerInvariant();
        var sendTo = request.Email.Trim();

        // Every member for whom this email is on file: own email, a linked guardian's email, or primary contact.
        var ownIds = await context.MemberEmails
            .Where(e => !e.IsDeleted && e.Address.ToLower() == lower)
            .Select(e => e.MemberId).ToListAsync(ct);

        var guardianIds = await context.GuardianEmails
            .Where(e => !e.IsDeleted && e.Address.ToLower() == lower)
            .Select(e => e.GuardianId).Distinct().ToListAsync(ct);
        var guardianMemberIds = guardianIds.Count == 0 ? new List<Guid>() : await context.GuardianLinks
            .Where(l => !l.IsDeleted && guardianIds.Contains(l.GuardianId))
            .Select(l => l.MemberId).ToListAsync(ct);

        var primaryIds = await context.Members
            .Where(m => m.PrimaryContactEmail != null && m.PrimaryContactEmail.ToLower() == lower)
            .Select(m => m.Id).ToListAsync(ct);

        var memberIds = ownIds.Concat(guardianMemberIds).Concat(primaryIds).Distinct().ToList();
        if (memberIds.Count == 0)
            return Result<bool>.Success(true); // generic success — never reveal whether the email exists

        // Re-load through the Members set (global soft-delete filter) so links to deleted members are dropped.
        var nameById = (await context.Members
            .Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName })
            .ToListAsync(ct))
            .ToDictionary(m => m.Id, m => $"{m.FirstName} {m.LastName}".Trim());

        var users = await context.Users
            .Where(u => memberIds.Contains(u.MemberId) && u.IsActive)
            .ToListAsync(ct);

        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');
        var expiry = DateTime.UtcNow.AddDays(ExpiryDays);
        var jobs = new List<EmailJob>();

        foreach (var user in users)
        {
            if (!nameById.TryGetValue(user.MemberId, out var name)) continue; // member soft-deleted → skip

            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
            user.PasswordResetToken = token;
            user.PasswordResetTokenExpiry = expiry;

            var link = $"{baseUrl}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}&setup=1";
            jobs.Add(new EmailJob("account_activation", sendTo, new Dictionary<string, string>
            {
                ["memberName"] = name,
                ["username"] = user.Email,
                ["activationLink"] = link,
                ["expiryDays"] = ExpiryDays.ToString(),
            }));
        }

        await context.SaveChangesAsync(ct);
        foreach (var job in jobs) emailQueue.Enqueue(job);
        return Result<bool>.Success(true);
    }
}
