using GNDJ.Application.Common.Interfaces;
using Microsoft.AspNetCore.Http;

namespace GNDJ.Infrastructure.Identity;

// Resolves the current applicant (public enrollment portal) from the JWT claims, kept strictly
// separate from member identity: returns null unless the token is an applicant token, so an applicant
// can never be treated as a member and vice versa.
public class CurrentApplicantService : ICurrentApplicantService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentApplicantService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? ApplicantAccountId
    {
        get
        {
            var user = _httpContextAccessor.HttpContext?.User;
            if (user?.FindFirst("account_type")?.Value != "applicant") return null;
            var claim = user.FindFirst("applicant_id");
            return claim is not null && Guid.TryParse(claim.Value, out var id) ? id : null;
        }
    }
}
