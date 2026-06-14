using FluentValidation;
using GNDJ.Application.Common.Validation;

namespace GNDJ.Application.Guardians;

public class CreateGuardianCommandValidator : AbstractValidator<CreateGuardianCommand>
{
    public CreateGuardianCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Profession).MaximumLength(150).NoHtml();
        RuleFor(x => x.RelationshipType).NotEmpty().WithMessage("Le lien de parenté est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000);
    }
}

public class UpdateGuardianCommandValidator : AbstractValidator<UpdateGuardianCommand>
{
    public UpdateGuardianCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().WithMessage("Le prénom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.LastName).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Profession).MaximumLength(150).NoHtml();
        RuleFor(x => x.Notes).MaximumLength(2000);
    }
}

public class UpdateGuardianLinkCommandValidator : AbstractValidator<UpdateGuardianLinkCommand>
{
    public UpdateGuardianLinkCommandValidator()
    {
        RuleFor(x => x.LinkId).NotEmpty();
        RuleFor(x => x.RelationshipType).NotEmpty().WithMessage("Le lien de parenté est requis.").MaximumLength(50).NoHtml();
    }
}

public class LinkGuardianCommandValidator : AbstractValidator<LinkGuardianCommand>
{
    public LinkGuardianCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty();
        RuleFor(x => x.GuardianId).NotEmpty();
        RuleFor(x => x.RelationshipType).NotEmpty().WithMessage("Le lien de parenté est requis.").MaximumLength(50).NoHtml();
    }
}

public class AddGuardianPhoneCommandValidator : AbstractValidator<AddGuardianPhoneCommand>
{
    public AddGuardianPhoneCommandValidator()
    {
        RuleFor(x => x.GuardianId).NotEmpty();
        RuleFor(x => x.CountryCode).NotEmpty().MaximumLength(10).NoHtml();
        RuleFor(x => x.Number).NotEmpty().WithMessage("Le numéro est requis.").MaximumLength(30).NoHtml();
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}

public class AddGuardianEmailCommandValidator : AbstractValidator<AddGuardianEmailCommand>
{
    public AddGuardianEmailCommandValidator()
    {
        RuleFor(x => x.GuardianId).NotEmpty();
        RuleFor(x => x.Address).NotEmpty().EmailAddress().WithMessage("Adresse email invalide.").MaximumLength(254);
        RuleFor(x => x.Type).NotEmpty().MaximumLength(50).NoHtml();
    }
}
