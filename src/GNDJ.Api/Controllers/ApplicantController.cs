using GNDJ.Application.Applicants;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Public applicant portal (demande d'inscription). Base route api/v1/applicant. Authenticated endpoints use the
/// isolated "applicant" JWT (applicant claim, wholly separate from User/Member/permissions); handlers resolve the
/// account via ICurrentApplicantService and reject non-applicant tokens. Anonymous endpoints
/// (config/register/verify/login/refresh) carry honeypot fields; register/resend are "forms" rate-limited,
/// login/verify/refresh "auth" rate-limited. Authenticated endpoints operate on the caller's own account only.
/// </summary>
[Route("api/v1/applicant")]
public class ApplicantController : BaseApiController
{
    /// <summary>Returns public portal configuration (units, classes, options, limits). Anonymous.</summary>
    [HttpGet("config")]
    [AllowAnonymous]
    public async Task<IActionResult> Config()
    {
        var result = await Mediator.Send(new GetApplicantConfigQuery());
        return Ok(result.Value);
    }

    /// <summary>Registers a new applicant account and sends an email-verification link. Anonymous, rate-limited.</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> Register([FromBody] RegisterApplicantCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Confirms an applicant email using the verification token. Anonymous, rate-limited.</summary>
    [HttpPost("verify-email")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyApplicantEmailCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Adresse email vérifiée." });
    }

    /// <summary>Authenticates an applicant and returns access plus refresh tokens. Anonymous, rate-limited.</summary>
    /// <response code="401">Invalid credentials.</response>
    [ProducesResponseType(401)]
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginApplicantCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Exchanges a valid refresh token for a new applicant access token. Anonymous, rate-limited.</summary>
    /// <response code="401">Invalid or expired refresh token.</response>
    [ProducesResponseType(401)]
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshApplicantTokenCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Resends the email-verification link to the current applicant. Rate-limited.</summary>
    [Authorize]
    [HttpPost("resend-verification")]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ResendVerification()
    {
        var result = await Mediator.Send(new ResendVerificationCommand());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Email de vérification renvoyé." });
    }

    /// <summary>Returns the current applicant's account and household profile.</summary>
    /// <response code="401">Applicant token missing or invalid.</response>
    [ProducesResponseType(401)]
    [Authorize]
    [HttpGet("profile")]
    public async Task<IActionResult> Profile()
    {
        var result = await Mediator.Send(new GetApplicantProfileQuery());
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Saves the applicant's household (shared parents, address, scout relations).</summary>
    [Authorize]
    [HttpPut("household")]
    public async Task<IActionResult> SaveHousehold([FromBody] SaveApplicantHouseholdCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Creates a draft enrollment request (demande) for one child under the current account.</summary>
    [Authorize]
    [HttpPost("demandes")]
    public async Task<IActionResult> Create([FromBody] CreateDemandeCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { id = result.Value });
    }

    /// <summary>Updates a draft demande owned by the current account.</summary>
    [Authorize]
    [HttpPut("demandes/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DemandeInput data)
    {
        var result = await Mediator.Send(new UpdateDemandeCommand(id, data));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Submits a demande for CG review (locks it from further editing).</summary>
    [Authorize]
    [HttpPost("demandes/{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id)
    {
        var result = await Mediator.Send(new SubmitDemandeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Deletes a demande owned by the current account.</summary>
    [Authorize]
    [HttpDelete("demandes/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteDemandeCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
