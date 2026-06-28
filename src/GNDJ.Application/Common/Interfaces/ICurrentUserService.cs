namespace GNDJ.Application.Common.Interfaces;

// The authenticated caller resolved from the request JWT — handlers read this for identity + authorization
// (own-data checks, unit-scoping). Permissions/AuthorizedUnitIds come straight from the token claims that
// AuthAccess baked in at login/refresh, so no per-request DB lookup is needed. All nullable when anonymous.
public interface ICurrentUserService
{
    Guid? UserId { get; }
    Guid? MemberId { get; }
    bool IsSuperAdmin { get; }
    IReadOnlyList<string> Permissions { get; }
    IReadOnlyList<Guid> AuthorizedUnitIds { get; }
}
