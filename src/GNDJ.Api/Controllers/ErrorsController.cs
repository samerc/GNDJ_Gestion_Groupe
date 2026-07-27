using GNDJ.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GNDJ.Api.Controllers;

// Receives client-side crash reports from the React error boundary / global browser error handlers, so a
// front-end failure (white screen, unhandled promise rejection) also alerts the super-admin and gets a
// reference the user can quote. Auth-only (the app the crash happened in is signed-in) + forms rate-limited
// so it can't be used to spam. Returns the reference the boundary shows the user.
[ApiController]
[Route("api/v1/errors")]
[Authorize]
[EnableRateLimiting("forms")]
public class ErrorsController : ControllerBase
{
    private readonly IErrorNotifier _errorNotifier;
    private readonly ILogger<ErrorsController> _logger;

    public ErrorsController(IErrorNotifier errorNotifier, ILogger<ErrorsController> logger)
    {
        _errorNotifier = errorNotifier;
        _logger = logger;
    }

    public record ClientErrorReport(string? Message, string? Detail, string? Url);

    /// <summary>Report a client-side error (React crash / unhandled browser error) for admin alerting.</summary>
    /// <response code="200">Reported; returns the reference to show the user.</response>
    /// <response code="401">Not authenticated.</response>
    [HttpPost("report")]
    public async Task<IActionResult> Report([FromBody] ClientErrorReport body)
    {
        var errorId = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        var email = User.FindFirst("email")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
        var sub = User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var ip = HttpContext.Connection?.RemoteIpAddress?.ToString();
        var who = $"{email ?? sub ?? "?"}{(ip is null ? "" : $" ({ip})")}";
        var url = string.IsNullOrWhiteSpace(body?.Url) ? "" : body!.Url;

        _logger.LogError("Client error {ErrorId} at {Url} User={User}: {Message}", errorId, url, who, body?.Message);
        await _errorNotifier.NotifyAsync(
            new ErrorReport(errorId, "client", body?.Message ?? "(sans message)", body?.Detail, "GET", url, who),
            HttpContext.RequestAborted);

        return Ok(new { errorId });
    }
}
