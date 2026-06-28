using GNDJ.Api.Authorization;
using GNDJ.Application.Maitrises;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Leadership (maîtrise) members grouped by unit. Route api/v1/maitrises.
/// CG/super-admin only (maitrise.manage). Auth is JWT or API-key.
/// </summary>
[Authorize]
[Route("api/v1/maitrises")]
public class MaitrisesController : BaseApiController
{
    /// <summary>Lists the leadership hierarchy grouped by unit. Requires maitrise.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Get()
    {
        var result = await Mediator.Send(new GetMaitrisesQuery());
        return Ok(result);
    }

    /// <summary>Ends a member's leadership function, removing them from the maîtrise. Requires maitrise.manage.</summary>
    [HttpPost("remove")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Remove([FromBody] RemoveFromMaitriseCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Transfers a leader to another unit, assigning a new function there (keep-both or close-old). Requires maitrise.manage.</summary>
    [HttpPost("transfer")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Transfer([FromBody] TransferMaitriseCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
