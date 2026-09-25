using GNDJ.Api.Authorization;
using GNDJ.Application.NewYear;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// "Nettoyage de nouvelle année": preview + start the yearly reset (export all documents, delete all but the kept
/// types, reset approvals, clear sections, move classes up) and download its document archive.
/// Route api/v1/new-year. Chef de Groupe (maitrise.manage); the archive download is super-admin only.
/// </summary>
[Authorize]
[Route("api/v1/new-year")]
public class NewYearController(INewYearCleanupService service) : BaseApiController
{
    /// <summary>What the cleanup would do now + the state of the last run (poll while running). Requires maitrise.manage.</summary>
    [HttpGet("cleanup")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Status()
    {
        var r = await Mediator.Send(new GetNewYearCleanupStatusQuery());
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Starts the cleanup for the current scout year (background; once per year). Requires maitrise.manage.</summary>
    [HttpPost("cleanup")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Start()
    {
        var r = await Mediator.Send(new StartNewYearCleanupCommand());
        return r.IsSuccess ? Accepted() : BadRequest(new { error = r.Error });
    }

    /// <summary>Downloads a document archive zip produced by the cleanup. Super-admin only (every member's documents).</summary>
    [HttpGet("archives/{fileName}")]
    public IActionResult Download(string fileName)
    {
        if (User.FindFirst("is_super_admin")?.Value != "true") return Forbid();
        var full = service.ResolveArchive(fileName);
        if (full is null) return NotFound(new { error = "Archive introuvable." });
        return PhysicalFile(full, "application/zip", Path.GetFileName(full), enableRangeProcessing: true);
    }
}
