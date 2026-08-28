using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Public;

// Public contact form. Replaces the old open-relay mail() script: the recipient is server-configured
// (never from the request), input is validated + NoHtml, and the abuse middleware + "forms" rate limit
// guard the endpoint. The message is delivered via the existing email queue (best-effort, non-blocking).
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

public class SendContactMessageCommandHandler(IApplicationDbContext context, IEmailQueue emailQueue)
    : IRequestHandler<SendContactMessageCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SendContactMessageCommand request, CancellationToken ct)
    {
        var configured = await context.Settings
            .Where(s => s.Key == "contact.recipient_email")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        var recipient = !string.IsNullOrWhiteSpace(configured)
            ? configured!.Trim()
            : await context.Users.Where(u => u.IsSuperAdmin && u.IsActive)
                .Select(u => u.Email).FirstOrDefaultAsync(ct);

        if (string.IsNullOrWhiteSpace(recipient))
            return Result<bool>.Failure("La messagerie de contact n'est pas configurée. Veuillez réessayer plus tard.");

        await emailQueue.EnqueueAsync(new EmailJob("contact_form", recipient, new Dictionary<string, string>
        {
            ["senderName"] = request.Name.Trim(),
            ["senderEmail"] = request.Email.Trim(),
            ["subject"] = request.Subject.Trim(),
            ["message"] = request.Message.Trim(),
        }), ct);

        return Result<bool>.Success(true);
    }
}
