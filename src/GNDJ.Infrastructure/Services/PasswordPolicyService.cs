using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace GNDJ.Infrastructure.Services;

// Reads the security.password_* settings into a PasswordPolicy, cached briefly in the shared IMemoryCache so
// the password validators (run on every password-setting request) don't hit the DB each time. A settings
// change takes effect within the cache window (~30s). Scoped (owns a DbContext); the cache is the singleton.
public class PasswordPolicyService : IPasswordPolicy
{
    private const string CacheKey = "password_policy";
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    private readonly IApplicationDbContext _context;
    private readonly IMemoryCache _cache;

    public PasswordPolicyService(IApplicationDbContext context, IMemoryCache cache)
    {
        _context = context;
        _cache = cache;
    }

    public async Task<PasswordPolicy> GetAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(CacheKey, out PasswordPolicy? cached) && cached is not null)
            return cached;

        var keys = new[]
        {
            "security.password_min_length", "security.password_require_uppercase",
            "security.password_require_lowercase", "security.password_require_digit",
            "security.password_require_special",
        };
        var map = await _context.Settings.Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        var d = PasswordPolicy.Default;
        bool Flag(string k, bool fallback) => map.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v)
            ? string.Equals(v, "true", StringComparison.OrdinalIgnoreCase)
            : fallback;
        // Clamp the configured min length into a sane range [4, MaxLength] so a bad setting can't lock everyone out.
        var min = map.TryGetValue("security.password_min_length", out var ml) && int.TryParse(ml, out var n)
            ? Math.Clamp(n, 4, PasswordPolicy.MaxLength)
            : d.MinLength;

        var policy = new PasswordPolicy(
            min,
            Flag("security.password_require_uppercase", d.RequireUppercase),
            Flag("security.password_require_lowercase", d.RequireLowercase),
            Flag("security.password_require_digit", d.RequireDigit),
            Flag("security.password_require_special", d.RequireSpecial));

        _cache.Set(CacheKey, policy, Ttl);
        return policy;
    }

    public async Task<string?> ValidateAsync(string? password, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(password))
            return "Le mot de passe est requis.";

        var p = await GetAsync(ct);
        if (password.Length < p.MinLength)
            return $"Le mot de passe doit contenir au moins {p.MinLength} caractères.";
        if (password.Length > PasswordPolicy.MaxLength)
            return $"Le mot de passe ne doit pas dépasser {PasswordPolicy.MaxLength} caractères.";
        if (p.RequireUppercase && !password.Any(char.IsUpper))
            return "Le mot de passe doit contenir au moins une majuscule.";
        if (p.RequireLowercase && !password.Any(char.IsLower))
            return "Le mot de passe doit contenir au moins une minuscule.";
        if (p.RequireDigit && !password.Any(char.IsDigit))
            return "Le mot de passe doit contenir au moins un chiffre.";
        // "Special" = anything that isn't a letter or digit (spaces included — a passphrase counts).
        if (p.RequireSpecial && password.All(char.IsLetterOrDigit))
            return "Le mot de passe doit contenir au moins un caractère spécial.";
        return null;
    }
}
