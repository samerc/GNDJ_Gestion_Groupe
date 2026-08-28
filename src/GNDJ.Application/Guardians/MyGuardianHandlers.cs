using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Guardians;

// Self-service famille edits ("Ma fiche" → Famille). A member manages the guardians (parents/tutors)
// linked to their OWN record — create a NEW guardian (never search/link arbitrary existing ones, which
// would expose other families), edit their linked guardians + contacts, and unlink. Every op verifies
// the guardian/link belongs to the caller (currentUser.MemberId). No members.edit, no approval.
static class MyGuardianAccess
{
    // True if the guardian is linked to the caller's OWN member.
    public static async Task<bool> IsMine(IApplicationDbContext ctx, ICurrentUserService user, Guid guardianId, CancellationToken ct)
    {
        if (user.MemberId is null) return false;
        return await ctx.GuardianLinks.AnyAsync(l => l.GuardianId == guardianId && l.MemberId == user.MemberId && !l.IsDeleted, ct);
    }
}

// ── Create a new guardian + link to self ─────────────────────────────────────
public record CreateMyGuardianCommand(
    string FirstName, string LastName, string? Profession, string? ProfessionDomain, bool IsDeceased,
    string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact, string? Notes
) : IRequest<Result<Guid>>;

public class CreateMyGuardianValidator : AbstractValidator<CreateMyGuardianCommand>
{
    public CreateMyGuardianValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.RelationshipType).NotEmpty().MaximumLength(50).NoHtml();
        RuleFor(x => x.Profession).MaximumLength(150).NoHtml();
        RuleFor(x => x.ProfessionDomain).MaximumLength(100).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000).NoHtml();
    }
}

public class CreateMyGuardianHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<CreateMyGuardianCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateMyGuardianCommand request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<Guid>.Failure("Aucun membre associé à ce compte.");

        var guardian = new Guardian
        {
            FirstName = request.FirstName, LastName = request.LastName,
            Profession = request.Profession, ProfessionDomain = request.ProfessionDomain, IsDeceased = request.IsDeceased, Notes = request.Notes,
        };
        context.Guardians.Add(guardian);
        context.GuardianLinks.Add(new GuardianLink
        {
            GuardianId = guardian.Id, MemberId = memberId.Value,
            RelationshipType = request.RelationshipType,
            IsPrimaryContact = request.IsPrimaryContact, IsEmergencyContact = request.IsEmergencyContact,
        });
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(guardian.Id);
    }
}

// ── Update one of my guardians ───────────────────────────────────────────────
public record UpdateMyGuardianCommand(
    Guid Id, string FirstName, string LastName, string? Profession, string? ProfessionDomain, bool IsDeceased, string? Notes
) : IRequest<Result<bool>>;

public class UpdateMyGuardianValidator : AbstractValidator<UpdateMyGuardianCommand>
{
    public UpdateMyGuardianValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100).NoHtml();
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100).NoHtml();
        RuleFor(x => x.Profession).MaximumLength(150).NoHtml();
        RuleFor(x => x.ProfessionDomain).MaximumLength(100).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000).NoHtml();
    }
}

public class UpdateMyGuardianHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateMyGuardianCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMyGuardianCommand request, CancellationToken ct)
    {
        if (!await MyGuardianAccess.IsMine(context, currentUser, request.Id, ct)) return Result<bool>.Failure("Parent introuvable.");
        var entity = await context.Guardians.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Parent introuvable.");
        entity.FirstName = request.FirstName; entity.LastName = request.LastName;
        entity.Profession = request.Profession; entity.ProfessionDomain = request.ProfessionDomain;
        entity.IsDeceased = request.IsDeceased; entity.Notes = request.Notes;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Update my link (relationship + flags) ────────────────────────────────────
public record UpdateMyGuardianLinkCommand(Guid LinkId, string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact) : IRequest<Result<bool>>;

public class UpdateMyGuardianLinkValidator : AbstractValidator<UpdateMyGuardianLinkCommand>
{
    public UpdateMyGuardianLinkValidator()
    {
        RuleFor(x => x.LinkId).NotEmpty();
        RuleFor(x => x.RelationshipType).NotEmpty().MaximumLength(50).NoHtml();
    }
}

public class UpdateMyGuardianLinkHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateMyGuardianLinkCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMyGuardianLinkCommand request, CancellationToken ct)
    {
        var link = await context.GuardianLinks.FindAsync([request.LinkId], ct);
        if (link is null || link.MemberId != currentUser.MemberId) return Result<bool>.Failure("Lien introuvable.");
        link.RelationshipType = request.RelationshipType;
        link.IsPrimaryContact = request.IsPrimaryContact;
        link.IsEmergencyContact = request.IsEmergencyContact;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Unlink a guardian from myself (the shared guardian record survives) ───────
public record UnlinkMyGuardianCommand(Guid LinkId) : IRequest<Result<bool>>;

public class UnlinkMyGuardianHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UnlinkMyGuardianCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UnlinkMyGuardianCommand request, CancellationToken ct)
    {
        var link = await context.GuardianLinks.FindAsync([request.LinkId], ct);
        if (link is null || link.MemberId != currentUser.MemberId) return Result<bool>.Failure("Lien introuvable.");
        context.GuardianLinks.Remove(link);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Guardian phones / emails (only on my linked guardians) ────────────────────
public record AddMyGuardianPhoneCommand(Guid GuardianId, string CountryCode, string Number, string Type, bool IsPrimary) : IRequest<Result<Guid>>;
public record DeleteMyGuardianPhoneCommand(Guid Id) : IRequest<Result<bool>>;
public record AddMyGuardianEmailCommand(Guid GuardianId, string Address, string Type, bool IsPrimary) : IRequest<Result<Guid>>;
public record DeleteMyGuardianEmailCommand(Guid Id) : IRequest<Result<bool>>;

public class AddMyGuardianPhoneValidator : AbstractValidator<AddMyGuardianPhoneCommand>
{
    public AddMyGuardianPhoneValidator()
    {
        RuleFor(x => x.CountryCode).NotEmpty().MaximumLength(10).NoHtml();
        RuleFor(x => x.Number).NotEmpty().WithMessage("Le numéro est requis.").MaximumLength(30).NoHtml();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}
public class AddMyGuardianEmailValidator : AbstractValidator<AddMyGuardianEmailCommand>
{
    public AddMyGuardianEmailValidator()
    {
        RuleFor(x => x.Address).NotEmpty().WithMessage("L'adresse courriel est requise.").EmailAddress().MaximumLength(150).NoHtml().RealEmail();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}

public class AddMyGuardianPhoneHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<AddMyGuardianPhoneCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddMyGuardianPhoneCommand request, CancellationToken ct)
    {
        if (!await MyGuardianAccess.IsMine(context, currentUser, request.GuardianId, ct)) return Result<Guid>.Failure("Parent introuvable.");
        var entity = new GuardianPhone { GuardianId = request.GuardianId, CountryCode = request.CountryCode, Number = request.Number, Type = request.Type, IsPrimary = request.IsPrimary };
        context.GuardianPhones.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}
public class DeleteMyGuardianPhoneHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteMyGuardianPhoneCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMyGuardianPhoneCommand request, CancellationToken ct)
    {
        var entity = await context.GuardianPhones.FindAsync([request.Id], ct);
        if (entity is null || !await MyGuardianAccess.IsMine(context, currentUser, entity.GuardianId, ct)) return Result<bool>.Failure("Téléphone introuvable.");
        context.GuardianPhones.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
public class AddMyGuardianEmailHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<AddMyGuardianEmailCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddMyGuardianEmailCommand request, CancellationToken ct)
    {
        if (!await MyGuardianAccess.IsMine(context, currentUser, request.GuardianId, ct)) return Result<Guid>.Failure("Parent introuvable.");
        var entity = new GuardianEmail { GuardianId = request.GuardianId, Address = request.Address, Type = request.Type, IsPrimary = request.IsPrimary };
        context.GuardianEmails.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}
public class DeleteMyGuardianEmailHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteMyGuardianEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMyGuardianEmailCommand request, CancellationToken ct)
    {
        var entity = await context.GuardianEmails.FindAsync([request.Id], ct);
        if (entity is null || !await MyGuardianAccess.IsMine(context, currentUser, entity.GuardianId, ct)) return Result<bool>.Failure("Courriel introuvable.");
        context.GuardianEmails.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
