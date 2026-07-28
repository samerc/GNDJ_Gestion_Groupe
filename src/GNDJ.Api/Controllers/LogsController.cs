using GNDJ.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Super-admin "Journal des erreurs": browse the recent Warning+ application logs (incl. every error alert's
// reference) so an incident can be diagnosed without waiting on / relying on email. Super-admin ONLY — logs
// carry user emails, IPs and request details.
[ApiController]
[Route("api/v1/logs")]
[Authorize]
public class LogsController : ControllerBase
{
    private readonly IErrorLogReader _reader;
    private readonly ICurrentUserService _currentUser;

    public LogsController(IErrorLogReader reader, ICurrentUserService currentUser)
    {
        _reader = reader;
        _currentUser = currentUser;
    }

    /// <summary>Browse recent application logs (Warning+). Super-admin only.</summary>
    /// <response code="200">Paged log entries.</response>
    /// <response code="403">Not a super-admin.</response>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? level, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        if (!_currentUser.IsSuperAdmin) return Forbid();
        var lvl = string.IsNullOrWhiteSpace(level) ? null : level;
        var q = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var result = await _reader.QueryAsync(lvl, q, page, pageSize, HttpContext.RequestAborted);
        return Ok(result);
    }
}
