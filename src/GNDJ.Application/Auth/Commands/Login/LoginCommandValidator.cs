using FluentValidation;

namespace GNDJ.Application.Auth.Commands.Login;

public class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("L'identifiant est requis.")
            .EmailAddress().WithMessage("L'identifiant est invalide.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Le mot de passe est requis.");
    }
}
