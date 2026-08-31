using GNDJ.Application.Sessions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Active-session viewer / control. Base route api/v1/sessions. SUPER-ADMIN only (enforced in the handlers):
/// lists live sessions (members/chefs + parent portal) and force-disconnects an account.
/// </summary>
[Authorize]
[Route("api/v1/sessions")]
public class SessionsController : BaseApiController
{
    /// <summary>Lists all accounts with a live session (non-expired refresh token). Super-admin only.</summary>
    /// <response code="200">Members and applicant sessions with login time, last activity and expiry.</response>
    /// <response code="403">Not a super-admin.</response>
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var result = await Mediator.Send(new GetActiveSessionsQuery());
        return Ok(result.Value);
    }

    /// <summary>Force-disconnects one account by clearing its refresh token (access dies within ≤15 min). Super-admin only.</summary>
    /// <response code="403">Not a super-admin.</response>
    [HttpPost("disconnect")]
    public async Task<IActionResult> Disconnect([FromBody] DisconnectSessionCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }
}
