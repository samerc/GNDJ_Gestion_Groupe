using GNDJ.Application.SystemHealth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>System health: background jobs, email/push delivery, disk, slow pages, configuration checks, stray files.
/// Access is checked in each handler (super-admin for the Système page; settings check for whoever can open
/// Paramètres; template check for admins).</summary>
[Authorize]
[Route("api/v1/system")]
public class SystemController : BaseApiController
{
    /// <summary>Everything the Système page shows, plus the plain-language list of problems. Super-admin.</summary>
    [HttpGet("status")]
    public async Task<IActionResult> Status() => Ok((await Mediator.Send(new GetSystemStatusQuery())).Value);

    /// <summary>Contradictory or risky settings (dates out of order, scout years that differ, test email mode…).</summary>
    [HttpGet("settings-check")]
    public async Task<IActionResult> SettingsCheck() => Ok((await Mediator.Send(new GetSettingsCheckQuery())).Value);

    /// <summary>Email templates whose {{variables}} would reach recipients unfilled.</summary>
    [HttpGet("email-templates-check")]
    public async Task<IActionResult> EmailTemplatesCheck() => Ok((await Mediator.Send(new GetEmailTemplateCheckQuery())).Value);

    /// <summary>Files in uploads/documents and uploads/photos that no record points to (older than a day). Super-admin.</summary>
    [HttpGet("orphan-files")]
    public async Task<IActionResult> OrphanFiles() => Ok((await Mediator.Send(new GetOrphanFilesQuery())).Value);

    /// <summary>Deletes the stray files found by a fresh scan. Super-admin.</summary>
    [HttpDelete("orphan-files")]
    public async Task<IActionResult> DeleteOrphanFiles()
    {
        var result = await Mediator.Send(new DeleteOrphanFilesCommand());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }
}
