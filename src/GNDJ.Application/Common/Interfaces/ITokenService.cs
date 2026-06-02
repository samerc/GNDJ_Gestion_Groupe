using GNDJ.Domain.Entities;

namespace GNDJ.Application.Common.Interfaces;

public interface ITokenService
{
    string GenerateAccessToken(User user, IEnumerable<string> permissions, IEnumerable<Guid> unitIds);
    string GenerateRefreshToken();
    DateTime GetRefreshTokenExpiry();
}
