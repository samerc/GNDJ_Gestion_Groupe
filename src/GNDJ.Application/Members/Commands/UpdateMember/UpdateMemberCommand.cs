using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.UpdateMember;

// Edits a member's core profile. Authorization is checked in the handler (own profile / unit leader).
public record UpdateMemberCommand(
    Guid Id, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? ExternalCardNumber, string? BloodType, string? Nationality, string? School,
    string? Classe, string? Section,
    string? MedicalNotes, string? Allergies, string? Notes
) : IRequest<Result<bool>>;

public class UpdateMemberCommandValidator : AbstractValidator<UpdateMemberCommand>
{
    private static readonly string[] AllowedGenders = ["Masculin", "Féminin"];

    public UpdateMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.")
            .MaximumLength(100).WithMessage("Le prénom ne doit pas dépasser 100 caractères.")
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le prénom contient des caractères invalides.");
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.")
            .MaximumLength(100).WithMessage("Le nom ne doit pas dépasser 100 caractères.")
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le nom contient des caractères invalides.");
        RuleFor(x => x.DateOfBirth).NotEmpty().WithMessage("La date de naissance est requise.")
            .LessThanOrEqualTo(DateOnly.FromDateTime(DateTime.UtcNow))
            .When(x => x.DateOfBirth.HasValue)
            .WithMessage("La date de naissance ne peut pas être dans le futur.");
        RuleFor(x => x.Gender).NotEmpty().WithMessage("Le genre est requis.")
            .Must(g => AllowedGenders.Contains(g))
            .When(x => !string.IsNullOrEmpty(x.Gender))
            .WithMessage("Le genre doit être 'Masculin' ou 'Féminin'.");
        RuleFor(x => x.CardNumber).MaximumLength(20);
        RuleFor(x => x.ExternalCardNumber).MaximumLength(50)
            .Must(n => n == null || !n.Contains('<') && !n.Contains('>')).WithMessage("Le numéro de carte contient des caractères invalides.");
        RuleFor(x => x.Nationality).NotEmpty().WithMessage("La nationalité est requise.").MaximumLength(50);
        RuleFor(x => x.School).NotEmpty().WithMessage("L'école est requise.").MaximumLength(100);
        RuleFor(x => x.Classe).NotEmpty().WithMessage("La classe est requise.").MaximumLength(50);
        RuleFor(x => x.Section).MaximumLength(5).WithMessage("La section ne doit pas dépasser 5 caractères.");
        RuleFor(x => x.BloodType).MaximumLength(10);
        RuleFor(x => x.MedicalNotes).MaximumLength(2000);
        RuleFor(x => x.Allergies).MaximumLength(2000);
        RuleFor(x => x.Notes).MaximumLength(2000);
    }
}

public class UpdateMemberCommandHandler : IRequestHandler<UpdateMemberCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public UpdateMemberCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(UpdateMemberCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Members.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Membre introuvable.");

        // Authorization: super admin can edit anyone; a member can edit their own profile;
        // a unit leader can edit members within their authorized units.
        if (!_currentUser.IsSuperAdmin && _currentUser.MemberId != request.Id)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            var hasUnitAccess = await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.Id && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), cancellationToken);
            if (!hasUnitAccess)
                return Result<bool>.Failure("Accès non autorisé à ce membre.");
        }

        // The official SDL/GDL card number must be unique across members (friendly 400 vs the DB index's 500).
        if (!string.IsNullOrWhiteSpace(request.ExternalCardNumber))
        {
            var ext = request.ExternalCardNumber.Trim();
            if (await _context.Members.AnyAsync(m => m.Id != request.Id && m.ExternalCardNumber == ext, cancellationToken))
                return Result<bool>.Failure($"Le numéro de carte « {ext} » est déjà attribué à un autre membre.");
        }

        var oldValues = new { entity.FirstName, entity.LastName, entity.CardNumber };

        entity.FirstName = request.FirstName;
        entity.LastName = request.LastName;
        entity.DateOfBirth = request.DateOfBirth;
        entity.Gender = request.Gender;
        entity.CardNumber = request.CardNumber;
        entity.ExternalCardNumber = request.ExternalCardNumber;
        entity.BloodType = request.BloodType;
        entity.Nationality = request.Nationality;
        entity.School = request.School;
        entity.Classe = request.Classe;
        entity.Section = request.Section;
        entity.MedicalNotes = request.MedicalNotes;
        entity.Allergies = request.Allergies;
        entity.Notes = request.Notes;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Member", entity.Id, oldValues: oldValues, newValues: new { entity.FirstName, entity.LastName, entity.CardNumber }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
