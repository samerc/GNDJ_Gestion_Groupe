using GNDJ.Application.Auth.Commands.ChangePassword;
using GNDJ.Application.Auth.Commands.ForgotUsername;
using GNDJ.Application.Auth.Commands.Login;
using GNDJ.Application.Auth.Commands.Logout;
using GNDJ.Application.Auth.Commands.RefreshToken;
using GNDJ.Application.Auth.Commands.Register;
using GNDJ.Application.Auth.Commands.RequestPasswordReset;
using GNDJ.Application.Auth.Commands.ResetPassword;
using GNDJ.Application.Auth.Commands.SignOutOtherDevices;
using GNDJ.Application.Auth.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Internal-user (User/Member) authentication — base route <c>api/v1/auth</c>.
/// </summary>
/// <remarks>
/// Mostly anonymous endpoints (register/login/refresh/forgot/reset). login/refresh/change-password are
/// rate-limited via the "auth" policy (per-IP); register/forgot/reset via the abuse-prone "forms" policy.
/// me/logout/change-password require authentication. Applicant (enrollment portal) auth lives in a
/// SEPARATE controller with its own JWT — this one never issues applicant tokens.
/// </remarks>
[Route("api/v1/auth")]
public class AuthController : BaseApiController
{
    /// <summary>Create a new internal user + member account.</summary>
    /// <response code="201">Account created.</response>
    /// <response code="400">Validation failed, or the email is already in use.</response>
    [HttpPost("register")]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> Register([FromBody] RegisterCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", result.Value);
    }

    /// <summary>Authenticate and receive a JWT access token + refresh token.</summary>
    /// <response code="200">Authenticated; returns the token pair, expiry and permissions.</response>
    /// <response code="401">Invalid email or password.</response>
    [ProducesResponseType(401)]
    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Exchange a valid refresh token for a fresh access/refresh token pair (rotation).</summary>
    /// <response code="200">New token pair issued.</response>
    /// <response code="401">Refresh token invalid or expired.</response>
    [ProducesResponseType(401)]
    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Sign out: invalidate the current user's stored refresh token.</summary>
    /// <response code="204">Logged out.</response>
    /// <response code="401">Not authenticated.</response>
    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var result = await Mediator.Send(new LogoutCommand());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Sign out all OTHER devices: rotate the refresh token so other sessions can no longer refresh (they drop within ~15 min). This device stays signed in with a fresh token pair.</summary>
    /// <response code="200">Other devices signed out; returns a new token pair for the current device.</response>
    /// <response code="401">Not authenticated.</response>
    [Authorize]
    [HttpPost("sign-out-other-devices")]
    public async Task<IActionResult> SignOutOtherDevices()
    {
        var result = await Mediator.Send(new SignOutOtherDevicesCommand());
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Get the authenticated user's profile, permissions and unit access (drives the UI).</summary>
    /// <response code="200">Current user info.</response>
    /// <response code="401">Not authenticated.</response>
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var result = await Mediator.Send(new GetMeQuery());
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Request a password-reset email.</summary>
    /// <response code="200">Reports whether the account was found and the masked address(es) the link was sent to.</response>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ForgotPassword([FromBody] RequestPasswordResetCommand command)
    {
        // Returns { found, sentTo[] } so the UI can confirm the account + masked target (or say "not found").
        var result = await Mediator.Send(command);
        return Ok(result.Value);
    }

    /// <summary>Identifiant oublié — send a member's username + set-password link to an email on file for them.</summary>
    /// <response code="200">Always generic ("if this email is on file, you'll receive your access") — no account enumeration.</response>
    [HttpPost("forgot-username")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ForgotUsername([FromBody] RequestMyAccessCommand command)
    {
        await Mediator.Send(command); // response is deliberately generic regardless of whether the email matched
        return Ok(new { message = "Si cette adresse est enregistrée sur un dossier, vous recevrez vos accès par email." });
    }

    /// <summary>Set a new password using the reset token from the email link.</summary>
    /// <response code="200">Password reset.</response>
    /// <response code="400">Token invalid/expired or the new password fails the strength policy.</response>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Mot de passe réinitialisé avec succès." });
    }

    /// <summary>Change the authenticated user's password (requires the current one; invalidates other sessions).</summary>
    /// <response code="200">Password changed.</response>
    /// <response code="400">Current password wrong, or the new password fails the strength policy.</response>
    /// <response code="401">Not authenticated.</response>
    [Authorize]
    [HttpPost("change-password")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Mot de passe modifié avec succès." });
    }
}
