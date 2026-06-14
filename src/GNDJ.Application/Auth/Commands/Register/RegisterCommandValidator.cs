using FluentValidation;
using GNDJ.Application.Common.Validation;

namespace GNDJ.Application.Auth.Commands.Register;

public class RegisterCommandValidator : AbstractValidator<RegisterCommand>
{
    public RegisterCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("L'adresse courriel est requise.")
            .EmailAddress().WithMessage("L'adresse courriel est invalide.")
            .MaximumLength(254);

        RuleFor(x => x.Password).StrongPassword();

        RuleFor(x => x.ConfirmPassword)
            .Equal(x => x.Password).WithMessage("Les mots de passe ne correspondent pas.");

        RuleFor(x => x.FirstName)
            .NotEmpty().WithMessage("Le prénom est requis.")
            .MaximumLength(100).NoHtml();

        RuleFor(x => x.LastName)
            .NotEmpty().WithMessage("Le nom est requis.")
            .MaximumLength(100).NoHtml();
    }
}
