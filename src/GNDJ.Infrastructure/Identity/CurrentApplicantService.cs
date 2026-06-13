using GNDJ.Application.Common.Interfaces;
using Microsoft.AspNetCore.Http;

namespace GNDJ.Infrastructure.Identity;

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
