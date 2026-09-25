using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace GNDJ.Infrastructure.Identity;

// Mints the two JWT families (member/staff vs. isolated applicant) and opaque refresh tokens.
// Member access tokens carry authorization data (permissions + unit_ids) inline so handlers can
// authorize without a DB round-trip; applicant tokens deliberately carry nothing but identity.
public class TokenService : ITokenService
{
    private readonly IConfiguration _configuration;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateAccessToken(User user, IEnumerable<string> permissions, IEnumerable<Guid> unitIds, Guid? sessionId = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Secret"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expirationMinutes = int.Parse(_configuration["Jwt:AccessTokenExpirationMinutes"] ?? "15");

        // sub = user id (read back by CurrentUserService); permissions/unit_ids are flattened into
        // comma-joined strings so authorization is self-contained in the token (no per-request lookup).
        var claims = new Dictionary<string, object>
        {
            [JwtRegisteredClaimNames.Sub] = user.Id.ToString(),
            [JwtRegisteredClaimNames.Email] = user.Email,
            ["member_id"] = user.MemberId.ToString(),
            ["is_super_admin"] = user.IsSuperAdmin.ToString().ToLower(),
            ["permissions"] = string.Join(",", permissions),
            ["unit_ids"] = string.Join(",", unitIds)
        };
        if (sessionId is not null) claims["sid"] = sessionId.Value.ToString();

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _configuration["Jwt:Issuer"],
            Audience = _configuration["Jwt:Audience"],
            Claims = claims,
            Expires = DateTime.UtcNow.AddMinutes(expirationMinutes),
            SigningCredentials = credentials
        };

        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(descriptor);
    }

    // "Voir comme" impersonation token: same shape as a member access token so the whole app authorizes as the
    // target, but is_super_admin is HARD-CODED false (a stand-in can never gain super-admin), and two extra
    // claims mark it: impersonation=true (read-only middleware blocks every mutation) + impersonator_id (the real
    // admin, for a truthful audit trail). Longer default TTL (60 min) than a normal 15-min token because there's
    // no refresh path during impersonation — it simply auto-exits on expiry. sub falls back to Guid.Empty for a
    // member with no login row (reads keyed on member_id still work; writes are blocked anyway).
    public string GenerateImpersonationToken(Guid? targetUserId, Guid targetMemberId, string email,
        IEnumerable<string> permissions, IEnumerable<Guid> unitIds, Guid impersonatorUserId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Secret"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expirationMinutes = int.Parse(_configuration["Jwt:ImpersonationTokenExpirationMinutes"] ?? "60");

        var claims = new Dictionary<string, object>
        {
            [JwtRegisteredClaimNames.Sub] = (targetUserId ?? Guid.Empty).ToString(),
            [JwtRegisteredClaimNames.Email] = email,
            ["member_id"] = targetMemberId.ToString(),
            ["is_super_admin"] = "false",
            ["permissions"] = string.Join(",", permissions),
            ["unit_ids"] = string.Join(",", unitIds),
            ["impersonation"] = "true",
            ["impersonator_id"] = impersonatorUserId.ToString()
        };

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _configuration["Jwt:Issuer"],
            Audience = _configuration["Jwt:Audience"],
            Claims = claims,
            Expires = DateTime.UtcNow.AddMinutes(expirationMinutes),
            SigningCredentials = credentials
        };

        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(descriptor);
    }

    public string GenerateApplicantToken(ApplicantAccount account)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Secret"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expirationMinutes = int.Parse(_configuration["Jwt:AccessTokenExpirationMinutes"] ?? "15");

        // account_type=applicant is the discriminator CurrentApplicantService checks so an applicant
        // token can never be mistaken for a member token (separate auth realm, no permissions/units).
        var claims = new Dictionary<string, object>
        {
            [JwtRegisteredClaimNames.Sub] = account.Id.ToString(),
            [JwtRegisteredClaimNames.Email] = account.Email,
            ["account_type"] = "applicant",
            ["applicant_id"] = account.Id.ToString()
        };

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _configuration["Jwt:Issuer"],
            Audience = _configuration["Jwt:Audience"],
            Claims = claims,
            Expires = DateTime.UtcNow.AddMinutes(expirationMinutes),
            SigningCredentials = credentials
        };

        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(descriptor);
    }

    // Opaque, cryptographically-random refresh token. Stored hashed (see PasswordHasher.HashToken);
    // the raw value is only ever held by the client.
    public string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    }

    // rememberMe=true ("Rester connecté") issues a long-lived refresh token (default 30 days) so the user
    // stays signed in across restarts; false = the short session window (default 7 days).
    public DateTime GetRefreshTokenExpiry(bool rememberMe = false)
    {
        var key = rememberMe ? "Jwt:RememberMeExpirationDays" : "Jwt:RefreshTokenExpirationDays";
        var fallback = rememberMe ? "30" : "7";
        var days = int.Parse(_configuration[key] ?? fallback);
        return DateTime.UtcNow.AddDays(days);
    }
}
