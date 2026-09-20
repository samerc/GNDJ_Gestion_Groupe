using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.SaveLeaverContact;

// Captures/confirms a LEAVING member's PERSONAL contact (email + phone) at passage time, so the group can
// re-contact them next year once they've become an alumnus. Writes to the member's OWN contacts (adds the
// email/phone only if it isn't already on file) and sets the email as the primary contact — so it all lives
// on the alumni fiche where a CG would look them up. Access = super-admin / group manager / an active leader
// of the member's unit (same rule as editing them). Both fields optional (confirm/edit, never required).
public record SaveLeaverContactCommand(Guid MemberId, string? Email, string? PhoneCountryCode, string? Phone)
    : IRequest<Result<bool>>;

public class SaveLeaverContactCommandValidator : AbstractValidator<SaveLeaverContactCommand>
{
    public SaveLeaverContactCommandValidator()
    {
        RuleFor(x => x.Email).MaximumLength(200).RealEmail();
        RuleFor(x => x.PhoneCountryCode).MaximumLength(10).NoHtml();
        RuleFor(x => x.Phone).MaximumLength(30).NoHtml();
    }
}

public class SaveLeaverContactCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SaveLeaverContactCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SaveLeaverContactCommand request, CancellationToken ct)
    {
        // Unit-scoped access (same rule as editing the member).
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");

        var email = request.Email?.Trim();
        var phone = request.Phone?.Trim();
        var cc = string.IsNullOrWhiteSpace(request.PhoneCountryCode) ? "+961" : request.PhoneCountryCode!.Trim();

        // Email → add to the member's own emails if not already there, and set it as the primary contact
        // (the recipient used for member-facing mail once they're alumni).
        if (!string.IsNullOrEmpty(email))
        {
            var lower = email.ToLower();
            var exists = await context.MemberEmails
                .AnyAsync(e => e.MemberId == member.Id && !e.IsDeleted && e.Address.ToLower() == lower, ct);
            if (!exists)
                context.MemberEmails.Add(new MemberEmail { MemberId = member.Id, Address = email, Type = "Personnel", IsPrimary = false });
            member.PrimaryContactEmail = email;
        }

        // Phone → add to the member's own phones (compared on digits, ignoring formatting spaces) if missing;
        // marks it primary when the member has no primary phone yet.
        if (!string.IsNullOrEmpty(phone))
        {
            var newDigits = Digits(phone);
            var phones = await context.MemberPhones.Where(p => p.MemberId == member.Id && !p.IsDeleted).ToListAsync(ct);
            var dup = phones.Any(p => Digits(p.Number) == newDigits);
            if (!dup)
                context.MemberPhones.Add(new MemberPhone
                {
                    MemberId = member.Id, CountryCode = cc, Number = phone, Type = "Mobile",
                    IsPrimary = phones.All(p => !p.IsPrimary),
                });
        }

        await context.SaveChangesAsync(ct);
        var name = await AuditNames.MemberAsync(context, member.Id, ct);
        await audit.LogAsync("Update", "Member", member.Id, newValues: new
        {
            Member = name,
            LeaverEmail = string.IsNullOrEmpty(email) ? null : email,
            LeaverPhone = string.IsNullOrEmpty(phone) ? null : $"{cc} {phone}".Trim(),
        }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }

    // Digits only, so a formatted "76 123 456" matches a migrated "76123456".
    static string Digits(string s) => new(s.Where(char.IsDigit).ToArray());
}
