using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Public;

// Public contact form. Replaces the old open-relay mail() script: the recipient is server-configured
// (never from the request), input is validated + NoHtml, and the abuse middleware + "forms" rate limit
// guard the endpoint. The message is delivered via the existing email queue (best-effort, non-blocking)
// AND persisted so managers can view + reply from the in-app inbox (see ContactMessageHandlers).
public record SendContactMessageCommand(string Name, string Email, string Subject, string Message) : IRequest<Result<bool>>;

public class SendContactMessageCommandValidator : AbstractValidator<SendContactMessageCommand>
{
    public SendContactMessageCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'adresse email est requise.")
            .EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254).RealEmail();
        RuleFor(x => x.Subject).NotEmpty().WithMessage("Le sujet est requis.").MaximumLength(150).NoHtml();
        RuleFor(x => x.Message).NotEmpty().WithMessage("Le message est requis.").MaximumLength(4000).NoHtml();
    }
}

public class SendContactMessageCommandHandler(IApplicationDbContext context, IEmailQueue emailQueue, INotificationService notifications)
    : IRequestHandler<SendContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SendContactMessageCommand request, CancellationToken ct)
    {
        var name = request.Name.Trim();
        var email = request.Email.Trim();
        var subject = request.Subject.Trim();
        var message = request.Message.Trim();

        // Persist first so the message is never lost (email delivery is best-effort / may be off). Managers
        // view + reply to it from the in-app inbox regardless of whether the notification email went out.
        context.ContactMessages.Add(new ContactMessage
        {
            SenderName = name, SenderEmail = email, Subject = subject, Message = message,
        });
        await context.SaveChangesAsync(ct);

        // Notify group managers in-app (independent of email) so a message is seen even if SMTP is down.
        await notifications.NotifyGroupManagersAsync(NotificationTypes.Info,
            "Nouveau message de contact", $"{name} — {subject}", "/admin/contact-messages", ct: ct);

        // Also send the legacy notification email to the configured recipient (or the first super-admin),
        // so nothing changes for those relying on it today.
        var configured = await context.Settings
            .Where(s => s.Key == "contact.recipient_email")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        var recipient = !string.IsNullOrWhiteSpace(configured)
            ? configured!.Trim()
            : await context.Users.Where(u => u.IsSuperAdmin && u.IsActive)
                .Select(u => u.Email).FirstOrDefaultAsync(ct);

        if (!string.IsNullOrWhiteSpace(recipient))
            await emailQueue.EnqueueAsync(new EmailJob("contact_form", recipient, new Dictionary<string, string>
            {
                ["senderName"] = name,
                ["senderEmail"] = email,
                ["subject"] = subject,
                ["message"] = message,
            }), ct);

        return Result<bool>.Success(true);
    }
}
