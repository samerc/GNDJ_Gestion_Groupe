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

    public Guid? UserId
    {
        get
        {
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst("sub");
            return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : null;
        }
    }

    public Guid? MemberId
    {
        get
        {
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
