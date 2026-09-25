using GNDJ.Domain.Entities;

namespace GNDJ.Application.Common.Interfaces;

public interface ITokenService
{
    // sessionId = the device session (UserSession.Id) this token belongs to, carried as the "sid" claim so
    // logout and "déconnecter les autres appareils" know which device is calling.
    string GenerateAccessToken(User user, IEnumerable<string> permissions, IEnumerable<Guid> unitIds, Guid? sessionId = null);
    // Token for a public applicant account — carries an "applicant" claim and NO member/permission
    // claims, so it can never reach the member/admin areas.
    string GenerateApplicantToken(ApplicantAccount account);
    // "Voir comme" (impersonation): a short-lived READ-ONLY access token carrying the TARGET member's
    // authorization (member_id/permissions/unit_ids) but forcing is_super_admin=false and recording the
    // acting admin (impersonator_id) so audit stays truthful. No refresh token is issued — the target's own
    // refresh token is never touched, so impersonating never disturbs their real session.
    string GenerateImpersonationToken(Guid? targetUserId, Guid targetMemberId, string email,
        IEnumerable<string> permissions, IEnumerable<Guid> unitIds, Guid impersonatorUserId);
    string GenerateRefreshToken();
    // rememberMe=true → long-lived refresh window (~30 days), false → short session window (~7 days).
    DateTime GetRefreshTokenExpiry(bool rememberMe = false);
}
