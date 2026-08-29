using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.UpdateMyProfile;

// Self-service profile edit: a member updates ONLY the editable fields of their OWN record — no
// members.edit permission and no approval needed (per the member self-edit feature). Locked fields
// (name, DOB, gender, matricule, external card number) are NOT part of this command, so a member can
// never change them here. Always operates on the caller's own MemberId (never a client-supplied id).
public record UpdateMyProfileCommand(
    string? Nationality, string? School, string? Classe, string? Section,
    string? BloodType, string? Allergies, string? MedicalNotes, string? ProfessionDomain = null
) : IRequest<Result<bool>>;

public class UpdateMyProfileCommandValidator : AbstractValidator<UpdateMyProfileCommand>
{
    public UpdateMyProfileCommandValidator()
    {
        // Required identity/school fields stay required (a member shouldn't blank them out); optional ones capped.
        RuleFor(x => x.Nationality).NotEmpty().WithMessage("La nationalité est requise.").MaximumLength(50)
            .Must(NoHtml).WithMessage("La nationalité contient des caractères invalides.");
        RuleFor(x => x.School).NotEmpty().WithMessage("L'école est requise.").MaximumLength(100)
            .Must(NoHtml).WithMessage("L'école contient des caractères invalides.");
        // Classe optional: a working member (Clan/Noyau/maîtrise) fills Profession instead.
        RuleFor(x => x.Classe).MaximumLength(50)
            .Must(NoHtml).WithMessage("La classe contient des caractères invalides.");
        RuleFor(x => x.ProfessionDomain).MaximumLength(100)
            .Must(NoHtml).WithMessage("La profession contient des caractères invalides.");
        RuleFor(x => x.Section).MaximumLength(5).WithMessage("La section ne doit pas dépasser 5 caractères.");
        RuleFor(x => x.BloodType).MaximumLength(10);
        RuleFor(x => x.Allergies).MaximumLength(2000).Must(NoHtml).WithMessage("Les allergies contiennent des caractères invalides.");
        RuleFor(x => x.MedicalNotes).MaximumLength(2000).Must(NoHtml).WithMessage("Les notes médicales contiennent des caractères invalides.");
    }

    private static bool NoHtml(string? s) => s == null || (!s.Contains('<') && !s.Contains('>'));
}

public class UpdateMyProfileCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    : IRequestHandler<UpdateMyProfileCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateMyProfileCommand request, CancellationToken ct)
    {
        // The target is ALWAYS the caller's own member — self-service, never a supplied id.
        var memberId = currentUser.MemberId;
        if (memberId is null)
            return Result<bool>.Failure("Aucun membre associé à ce compte.");

        var entity = await context.Members.FindAsync([memberId.Value], ct);
        if (entity is null)
            return Result<bool>.Failure("Membre introuvable.");

        // Update only the member-editable fields; locked fields (name/DOB/gender/card numbers) untouched.
        entity.Nationality = request.Nationality;
        entity.School = request.School;
        entity.Classe = request.Classe;
        entity.ProfessionDomain = request.ProfessionDomain;
        entity.Section = request.Section;
        entity.BloodType = request.BloodType;
        entity.Allergies = request.Allergies;
        entity.MedicalNotes = request.MedicalNotes;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "Member", entity.Id,
            newValues: new { entity.Nationality, entity.School, entity.Classe, entity.Section, entity.BloodType },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
