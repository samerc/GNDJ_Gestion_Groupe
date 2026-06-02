namespace GNDJ.Application.Common.Interfaces;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    Guid? MemberId { get; }
    bool IsSuperAdmin { get; }
    IReadOnlyList<string> Permissions { get; }
    IReadOnlyList<Guid> AuthorizedUnitIds { get; }
}
