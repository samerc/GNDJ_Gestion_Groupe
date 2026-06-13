using GNDJ.Domain.Entities;

namespace GNDJ.Application.Common.Interfaces;

public interface ITokenService
{
    string GenerateAccessToken(User user, IEnumerable<string> permissions, IEnumerable<Guid> unitIds);
    // Token for a public applicant account — carries an "applicant" claim and NO member/permission
    // claims, so it can never reach the member/admin areas.
    string GenerateApplicantToken(ApplicantAccount account);
    string GenerateRefreshToken();
    DateTime GetRefreshTokenExpiry();
}
