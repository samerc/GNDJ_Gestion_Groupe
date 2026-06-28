using GNDJ.Application.Applicants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

// Public applicant portal (demande d'inscription); base route api/v1/applicant. Authed endpoints use the
// isolated "applicant" JWT (applicant claim — wholly separate from User/Member/permissions); handlers
// resolve the account via ICurrentApplicantService and reject non-applicant tokens. Anonymous endpoints
// (config/register/verify/login/refresh) carry honeypot fields; register/resend are "forms" rate-limited,
// login/verify/refresh "auth" rate-limited. The [Authorize] endpoints below operate on the caller's own
// account only (no cross-account access — see IDOR audit).
[Route("api/v1/applicant")]
public class ApplicantController : BaseApiController
{
    [HttpGet("config")]
    [AllowAnonymous]
    public async Task<IActionResult> Config()
    {
        var result = await Mediator.Send(new GetApplicantConfigQuery());
        return Ok(result.Value);
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> Register([FromBody] RegisterApplicantCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost("verify-email")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyApplicantEmailCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Adresse email vérifiée." });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginApplicantCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshApplicantTokenCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    [Authorize]
    [HttpPost("resend-verification")]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ResendVerification()
    {
        var result = await Mediator.Send(new ResendVerificationCommand());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Email de vérification renvoyé." });
    }

    [Authorize]
    [HttpGet("profile")]
    public async Task<IActionResult> Profile()
    {
        var result = await Mediator.Send(new GetApplicantProfileQuery());
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    [Authorize]
    [HttpPut("household")]
    public async Task<IActionResult> SaveHousehold([FromBody] SaveApplicantHouseholdCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    [Authorize]
    [HttpPost("demandes")]
    public async Task<IActionResult> Create([FromBody] CreateDemandeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { id = result.Value });
    }

    [Authorize]
    [HttpPut("demandes/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DemandeInput data)
    {
        var result = await Mediator.Send(new UpdateDemandeCommand(id, data));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    [Authorize]
    [HttpPost("demandes/{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id)
    {
        var result = await Mediator.Send(new SubmitDemandeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    [Authorize]
    [HttpDelete("demandes/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteDemandeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
