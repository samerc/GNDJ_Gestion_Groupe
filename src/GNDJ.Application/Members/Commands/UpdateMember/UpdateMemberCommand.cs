using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Members.Commands.UpdateMember;

public record UpdateMemberCommand(
    Guid Id, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? BloodType, string? Nationality, string? School,
    string? Classe, string? Section,
    string? MedicalNotes, string? Allergies, string? Notes
) : IRequest<Result<bool>>;

public class UpdateMemberCommandValidator : AbstractValidator<UpdateMemberCommand>
{
    private static readonly string[] AllowedGenders = ["Masculin", "Féminin"];

    public UpdateMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.DateOfBirth).NotEmpty().WithMessage("La date de naissance est requise.")
            .LessThanOrEqualTo(DateOnly.FromDateTime(DateTime.UtcNow))
            .When(x => x.DateOfBirth.HasValue)
            .WithMessage("La date de naissance ne peut pas être dans le futur.");
        RuleFor(x => x.Gender).NotEmpty().WithMessage("Le genre est requis.")
            .Must(g => AllowedGenders.Contains(g))
            .When(x => !string.IsNullOrEmpty(x.Gender))
            .WithMessage("Le genre doit être 'Masculin' ou 'Féminin'.");
        RuleFor(x => x.CardNumber).MaximumLength(20);
        RuleFor(x => x.Nationality).NotEmpty().WithMessage("La nationalité est requise.").MaximumLength(50);
        RuleFor(x => x.School).NotEmpty().WithMessage("L'école est requise.").MaximumLength(100);
        RuleFor(x => x.Classe).NotEmpty().WithMessage("La classe est requise.").MaximumLength(50);
        RuleFor(x => x.Section).MaximumLength(5);
    }
}

public class UpdateMemberCommandHandler : IRequestHandler<UpdateMemberCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateMemberCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateMemberCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Members.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Membre introuvable.");

        var oldValues = new { entity.FirstName, entity.LastName, entity.CardNumber };

        entity.FirstName = request.FirstName;
        entity.LastName = request.LastName;
        entity.DateOfBirth = request.DateOfBirth;
        entity.Gender = request.Gender;
        entity.CardNumber = request.CardNumber;
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
