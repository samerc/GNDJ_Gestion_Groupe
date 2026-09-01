using GNDJ.Application.Common.Interfaces;
using Microsoft.AspNetCore.Http;

namespace GNDJ.Infrastructure.Identity;

// Exposes the current member/staff identity + authorization context to handlers by reading it back
// out of the JWT claims on the ambient HttpContext (claims minted in TokenService.GenerateAccessToken).
// Returns null/empty when unauthenticated (e.g. applicant or anonymous request) — callers guard.
public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    // An applicant token (account_type=applicant, minted for the public enrolment portal) carries its
    // OWN account id in `sub` — that id is NOT a users row. It must never be surfaced as a member UserId:
    // doing so writes a bogus user_id into audit_logs (FK violation on fk_audit_logs_users_user_id) when a
    // parent hits an anonymous member-audited endpoint (e.g. /applicant/login) with their applicant token
    // still attached. Treat any applicant-token request as unauthenticated for the member/staff identity.
    private bool IsApplicant =>
        _httpContextAccessor.HttpContext?.User.FindFirst("account_type")?.Value == "applicant";

    public Guid? UserId
    {
        get
        {
            if (IsApplicant) return null;
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("sub");
            return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : null;
        }
    }

    public Guid? MemberId
    {
        get
        {
            if (IsApplicant) return null;
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("member_id");
            return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : null;
        }
    }

    public bool IsSuperAdmin
    {
        get
        {
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("is_super_admin");
            return claim?.Value == "true";
        }
    }

    public IReadOnlyList<string> Permissions
    {
        get
        {
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("permissions");
            if (string.IsNullOrEmpty(claim?.Value)) return [];
            return claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries);
        }
    }

    public IReadOnlyList<Guid> AuthorizedUnitIds
    {
        get
        {
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("unit_ids");
            if (string.IsNullOrEmpty(claim?.Value)) return [];
            return claim.Value.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Where(s => Guid.TryParse(s, out _))
                .Select(Guid.Parse)
                .ToList();
        }
    }
}
