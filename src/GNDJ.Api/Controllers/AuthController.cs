using GNDJ.Application.Auth.Commands.ChangePassword;
using GNDJ.Application.Auth.Commands.Login;
using GNDJ.Application.Auth.Commands.Logout;
using GNDJ.Application.Auth.Commands.RefreshToken;
using GNDJ.Application.Auth.Commands.Register;
using GNDJ.Application.Auth.Commands.RequestPasswordReset;
using GNDJ.Application.Auth.Commands.ResetPassword;
using GNDJ.Application.Auth.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

[Route("api/v1/auth")]
public class AuthController : BaseApiController
{
    [HttpPost("register")]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> Register([FromBody] RegisterCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", result.Value);
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var result = await Mediator.Send(new LogoutCommand());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var result = await Mediator.Send(new GetMeQuery());
        if (!result.IsSuccess) return Unauthorized(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ForgotPassword([FromBody] RequestPasswordResetCommand command)
    {
        await Mediator.Send(command);
        return Ok(new { message = "Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé." });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("forms")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { message = "Mot de passe réinitialisé avec succès." });
    }

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
