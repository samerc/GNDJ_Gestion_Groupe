using FluentValidation;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Application.Common.Validation;

// Reusable validation rules shared across all command validators, so input checks are consistent
// (length caps, HTML/injection rejection, password policy) instead of copy-pasted per command.
public static class ValidationExtensions
{
    private const string HtmlMessage = "Les caractères « < » et « > » ne sont pas autorisés.";

    private static bool ContainsNoAngleBrackets(string? s)
        => string.IsNullOrEmpty(s) || (!s.Contains('<') && !s.Contains('>'));

    // Rejects '<' and '>' (rudimentary stored-XSS / injection guard). Binds to both `string` and
    // `string?` rule builders (nullable annotations don't create distinct types).
    public static IRuleBuilderOptions<T, string?> NoHtml<T>(this IRuleBuilder<T, string?> rule)
        => rule.Must(ContainsNoAngleBrackets).WithMessage(HtmlMessage);

    // Optional hex color (#RRGGBB, '#' optional).
    public static IRuleBuilderOptions<T, string?> HexColor<T>(this IRuleBuilder<T, string?> rule)
        => rule.Must(c => string.IsNullOrEmpty(c) || System.Text.RegularExpressions.Regex.IsMatch(c, "^#?[0-9A-Fa-f]{6}$"))
            .WithMessage("Couleur invalide (format hexadécimal attendu, ex. #3B82F6).");

    // Legacy static password policy: 8–128 chars + at least one upper, one lower, one digit. Superseded by
    // the CONFIGURABLE PasswordPolicy() rule below (driven by the security.password_* settings) — kept only as
    // a fallback for any path that doesn't have IPasswordPolicy injected. 128 cap matters because bcrypt
    // silently truncates at 72 bytes.
    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule)
        => rule.NotEmpty().WithMessage("Le mot de passe est requis.")
            .MinimumLength(8).WithMessage("Le mot de passe doit contenir au moins 8 caractères.")
            .MaximumLength(128).WithMessage("Le mot de passe ne doit pas dépasser 128 caractères.")
            .Matches("[A-Z]").WithMessage("Le mot de passe doit contenir au moins une majuscule.")
            .Matches("[a-z]").WithMessage("Le mot de passe doit contenir au moins une minuscule.")
            .Matches("[0-9]").WithMessage("Le mot de passe doit contenir au moins un chiffre.");

    // Configurable password policy: enforces the current security.password_* rules via IPasswordPolicy.
    // Runs async (the validation pipeline calls ValidateAsync), reading the settings-backed, cached policy so
    // it's ONE source of truth shared with the frontend (GET /auth/password-policy).
    public static IRuleBuilderOptionsConditions<T, string> PasswordPolicy<T>(this IRuleBuilder<T, string> rule, IPasswordPolicy policy)
        => rule.CustomAsync(async (password, ctx, ct) =>
        {
            var error = await policy.ValidateAsync(password, ct);
            if (error is not null)
                ctx.AddFailure(error);
        });
}
