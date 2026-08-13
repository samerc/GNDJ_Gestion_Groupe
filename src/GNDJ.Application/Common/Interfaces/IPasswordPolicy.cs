namespace GNDJ.Application.Common.Interfaces;

// The configurable password-complexity rules (driven by the `security.password_*` settings). One source of
// truth: enforced server-side by the password validators AND surfaced to the frontend (GET /auth/password-policy)
// so the set/change-password screens show + check the exact same rules. MaxLength is a fixed hard cap
// (bcrypt silently truncates at 72 bytes, so 128 is generous and prevents pathological inputs).
public record PasswordPolicy(
    int MinLength,
    bool RequireUppercase,
    bool RequireLowercase,
    bool RequireDigit,
    bool RequireSpecial)
{
    public const int MaxLength = 128;

    // The defaults if the settings are missing — matches the legacy hardcoded StrongPassword rule.
    public static PasswordPolicy Default { get; } = new(8, true, true, true, false);
}

public interface IPasswordPolicy
{
    // Current effective policy (settings-backed, briefly cached).
    Task<PasswordPolicy> GetAsync(CancellationToken ct = default);

    // Validates a password against the current policy. Returns null when it passes, else the first
    // French error message to show the user.
    Task<string?> ValidateAsync(string? password, CancellationToken ct = default);
}
