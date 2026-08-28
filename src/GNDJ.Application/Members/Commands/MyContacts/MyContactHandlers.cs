using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.MyContacts;

// Self-service contact edits ("Ma fiche" → Coordonnées). Every command operates STRICTLY on the caller's
// OWN member (currentUser.MemberId) — unlike the leader-facing Add/Update/Delete{Phone,Email,Address}
// commands, there is NO unit-leader path here, so a member can only ever touch their own contacts. No
// members.edit permission and no approval needed. Update/Delete verify the row belongs to the caller.

// ── helpers ─────────────────────────────────────────────────────────────────
static class MyContactAccess
{
    // The caller's own member id, or null if their account has none (then all self-service ops fail).
    public static Guid? OwnMemberId(ICurrentUserService currentUser) => currentUser.MemberId;
}

// ── Phones ──────────────────────────────────────────────────────────────────
public record AddMyPhoneCommand(string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<Guid>>;
public record UpdateMyPhoneCommand(Guid Id, string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<bool>>;
public record DeleteMyPhoneCommand(Guid Id) : IRequest<Result<bool>>;

public class AddMyPhoneValidator : AbstractValidator<AddMyPhoneCommand>
{
    public AddMyPhoneValidator()
    {
        RuleFor(x => x.CountryCode).NotEmpty().MaximumLength(10).NoHtml();
        RuleFor(x => x.Number).NotEmpty().WithMessage("Le numéro est requis.").MaximumLength(30).NoHtml();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}
public class UpdateMyPhoneValidator : AbstractValidator<UpdateMyPhoneCommand>
{
    public UpdateMyPhoneValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CountryCode).NotEmpty().MaximumLength(10).NoHtml();
        RuleFor(x => x.Number).NotEmpty().WithMessage("Le numéro est requis.").MaximumLength(30).NoHtml();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}

public class AddMyPhoneHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<AddMyPhoneCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddMyPhoneCommand request, CancellationToken ct)
    {
        var memberId = MyContactAccess.OwnMemberId(currentUser);
        if (memberId is null) return Result<Guid>.Failure("Aucun membre associé à ce compte.");
        var entity = new MemberPhone { MemberId = memberId.Value, CountryCode = request.CountryCode, Number = request.Number, Type = request.Type, IsPrimary = request.IsPrimary, IsEmergency = request.IsEmergency };
        context.MemberPhones.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}
public class UpdateMyPhoneHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateMyPhoneCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMyPhoneCommand request, CancellationToken ct)
    {
        var entity = await context.MemberPhones.FindAsync([request.Id], ct);
        if (entity is null || entity.MemberId != currentUser.MemberId) return Result<bool>.Failure("Téléphone introuvable.");
        entity.CountryCode = request.CountryCode; entity.Number = request.Number; entity.Type = request.Type; entity.IsPrimary = request.IsPrimary; entity.IsEmergency = request.IsEmergency;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
public class DeleteMyPhoneHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteMyPhoneCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMyPhoneCommand request, CancellationToken ct)
    {
        var entity = await context.MemberPhones.FindAsync([request.Id], ct);
        if (entity is null || entity.MemberId != currentUser.MemberId) return Result<bool>.Failure("Téléphone introuvable.");
        context.MemberPhones.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Emails ──────────────────────────────────────────────────────────────────
public record AddMyEmailCommand(string Address, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<Guid>>;
public record UpdateMyEmailCommand(Guid Id, string Address, string Type, bool IsPrimary, bool IsEmergency) : IRequest<Result<bool>>;
public record DeleteMyEmailCommand(Guid Id) : IRequest<Result<bool>>;

public class AddMyEmailValidator : AbstractValidator<AddMyEmailCommand>
{
    public AddMyEmailValidator()
    {
        RuleFor(x => x.Address).NotEmpty().WithMessage("L'adresse courriel est requise.").EmailAddress().MaximumLength(150).NoHtml().RealEmail();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}
public class UpdateMyEmailValidator : AbstractValidator<UpdateMyEmailCommand>
{
    public UpdateMyEmailValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Address).NotEmpty().WithMessage("L'adresse courriel est requise.").EmailAddress().MaximumLength(150).NoHtml().RealEmail();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}

public class AddMyEmailHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<AddMyEmailCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddMyEmailCommand request, CancellationToken ct)
    {
        var memberId = MyContactAccess.OwnMemberId(currentUser);
        if (memberId is null) return Result<Guid>.Failure("Aucun membre associé à ce compte.");
        var entity = new MemberEmail { MemberId = memberId.Value, Address = request.Address, Type = request.Type, IsPrimary = request.IsPrimary, IsEmergency = request.IsEmergency };
        context.MemberEmails.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}
public class UpdateMyEmailHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateMyEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMyEmailCommand request, CancellationToken ct)
    {
        var entity = await context.MemberEmails.FindAsync([request.Id], ct);
        if (entity is null || entity.MemberId != currentUser.MemberId) return Result<bool>.Failure("Courriel introuvable.");
        entity.Address = request.Address; entity.Type = request.Type; entity.IsPrimary = request.IsPrimary; entity.IsEmergency = request.IsEmergency;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
public class DeleteMyEmailHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteMyEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMyEmailCommand request, CancellationToken ct)
    {
        var entity = await context.MemberEmails.FindAsync([request.Id], ct);
        if (entity is null || entity.MemberId != currentUser.MemberId) return Result<bool>.Failure("Courriel introuvable.");
        context.MemberEmails.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Verify personal contact details (leader first-login prompt) ───────────────
// A member who became a leader confirms/corrects their PERSONAL email + phone (many still had a parent's on
// file). Sets the email as the member's primary contact email (added to their own emails), adds the phone to
// their own phones, and stamps ContactVerifiedAt so the one-time "verify your details" screen stops showing.
// Phone is optional; email is required.
public record VerifyMyContactCommand(string Email, string? CountryCode, string? Phone) : IRequest<Result<bool>>;

public class VerifyMyContactValidator : AbstractValidator<VerifyMyContactCommand>
{
    public VerifyMyContactValidator()
    {
        RuleFor(x => x.Email).NotEmpty().WithMessage("L'adresse courriel est requise.").EmailAddress().MaximumLength(150).NoHtml();
        RuleFor(x => x.CountryCode).MaximumLength(10).NoHtml();
        RuleFor(x => x.Phone).MaximumLength(30).NoHtml();
    }
}

public class VerifyMyContactHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<VerifyMyContactCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(VerifyMyContactCommand request, CancellationToken ct)
    {
        var memberId = MyContactAccess.OwnMemberId(currentUser);
        if (memberId is null) return Result<bool>.Failure("Aucun membre associé à ce compte.");
        var member = await context.Members.FindAsync([memberId.Value], ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");

        var email = request.Email.Trim();
        member.PrimaryContactEmail = email;
        member.ContactVerifiedAt = DateTime.UtcNow;

        // Ensure the confirmed address is one of the member's OWN emails (a real personal email on file), adding
        // it if missing. Case-insensitive match against existing rows.
        var emailExists = await context.MemberEmails
            .AnyAsync(e => e.MemberId == memberId.Value && !e.IsDeleted && e.Address.ToLower() == email.ToLower(), ct);
        if (!emailExists)
            context.MemberEmails.Add(new MemberEmail { MemberId = memberId.Value, Address = email, Type = "Personnel", IsPrimary = true, IsEmergency = false });

        // Personal phone (optional): add it to the member's own phones if a matching number isn't already there.
        var phone = request.Phone?.Trim();
        if (!string.IsNullOrWhiteSpace(phone))
        {
            var cc = string.IsNullOrWhiteSpace(request.CountryCode) ? "+961" : request.CountryCode!.Trim();
            var phoneExists = await context.MemberPhones
                .AnyAsync(p => p.MemberId == memberId.Value && !p.IsDeleted && p.Number == phone, ct);
            if (!phoneExists)
                context.MemberPhones.Add(new MemberPhone { MemberId = memberId.Value, CountryCode = cc, Number = phone, Type = "Mobile", IsPrimary = true, IsEmergency = false });
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("VerifyContact", "Member", member.Id, newValues: new { email, phone }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Addresses ───────────────────────────────────────────────────────────────
public record AddMyAddressCommand(string Type, string Country, string City, string? Details, bool IsPrimary) : IRequest<Result<Guid>>;
public record UpdateMyAddressCommand(Guid Id, string Type, string Country, string City, string? Details, bool IsPrimary) : IRequest<Result<bool>>;
public record DeleteMyAddressCommand(Guid Id) : IRequest<Result<bool>>;

public class AddMyAddressValidator : AbstractValidator<AddMyAddressCommand>
{
    public AddMyAddressValidator()
    {
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
        RuleFor(x => x.Country).NotEmpty().WithMessage("Le pays est requis.").MaximumLength(60).NoHtml();
        RuleFor(x => x.City).NotEmpty().WithMessage("La ville est requise.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Details).MaximumLength(200).NoHtml();
    }
}
public class UpdateMyAddressValidator : AbstractValidator<UpdateMyAddressCommand>
{
    public UpdateMyAddressValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
        RuleFor(x => x.Country).NotEmpty().WithMessage("Le pays est requis.").MaximumLength(60).NoHtml();
        RuleFor(x => x.City).NotEmpty().WithMessage("La ville est requise.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Details).MaximumLength(200).NoHtml();
    }
}

public class AddMyAddressHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<AddMyAddressCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddMyAddressCommand request, CancellationToken ct)
    {
        var memberId = MyContactAccess.OwnMemberId(currentUser);
        if (memberId is null) return Result<Guid>.Failure("Aucun membre associé à ce compte.");
        var entity = new MemberAddress { MemberId = memberId.Value, Type = request.Type, Country = request.Country, City = request.City, Details = request.Details, IsPrimary = request.IsPrimary };
        context.MemberAddresses.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}
public class UpdateMyAddressHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateMyAddressCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMyAddressCommand request, CancellationToken ct)
    {
        var entity = await context.MemberAddresses.FindAsync([request.Id], ct);
        if (entity is null || entity.MemberId != currentUser.MemberId) return Result<bool>.Failure("Adresse introuvable.");
        entity.Type = request.Type; entity.Country = request.Country; entity.City = request.City; entity.Details = request.Details; entity.IsPrimary = request.IsPrimary;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
public class DeleteMyAddressHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteMyAddressCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMyAddressCommand request, CancellationToken ct)
    {
        var entity = await context.MemberAddresses.FindAsync([request.Id], ct);
        if (entity is null || entity.MemberId != currentUser.MemberId) return Result<bool>.Failure("Adresse introuvable.");
        context.MemberAddresses.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
