using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;

namespace GNDJ.Application.Members.Commands.UpdateMember;

public record UpdateMemberCommand(
    Guid Id, string FirstName, string LastName, DateOnly? DateOfBirth, string? Gender,
    string? CardNumber, string? BloodType, string? Nationality, string? School,
    string? MedicalNotes, string? Allergies, string? Notes
) : IRequest<Result<bool>>;

public class UpdateMemberCommandValidator : AbstractValidator<UpdateMemberCommand>
{
    public UpdateMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.").MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100);
        RuleFor(x => x.CardNumber).MaximumLength(20);
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
        entity.MedicalNotes = request.MedicalNotes;
        entity.Allergies = request.Allergies;
        entity.Notes = request.Notes;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Member", entity.Id, oldValues: oldValues, newValues: new { entity.FirstName, entity.LastName, entity.CardNumber }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
