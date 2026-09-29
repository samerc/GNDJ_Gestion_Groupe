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

    /// <summary>Next year's maîtrise plan: current leaders by unit + planned changes. Requires maitrise.manage.</summary>
    [HttpGet("plan")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetPlan() => Ok(await Mediator.Send(new GetMaitrisePlanQuery()));

    /// <summary>Plans a new leadership function for next year (applied with the passage). Requires maitrise.manage.</summary>
    [HttpPost("plan/start")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> PlanStart([FromBody] PlanMaitriseStartCommand command) => FromResult(await Mediator.Send(command));

    /// <summary>Plans the end of a leadership function next year (applied with the passage). Requires maitrise.manage.</summary>
    [HttpPost("plan/end")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> PlanEnd([FromBody] PlanMaitriseEndCommand command) => FromResult(await Mediator.Send(command));

    /// <summary>Plans a change of unit/function next year (applied with the passage). Requires maitrise.manage.</summary>
    [HttpPost("plan/change")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> PlanChange([FromBody] PlanMaitriseChangeCommand command) => FromResult(await Mediator.Send(command));

    /// <summary>Cancels a planned change. Requires maitrise.manage.</summary>
    [HttpDelete("plan/{id:guid}")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> CancelPlan(Guid id) => FromResult(await Mediator.Send(new CancelMaitrisePlanLineCommand(id)));

    /// <summary>Member search for « Ajouter un chef »: chefs anywhere + members of the older branches (not the youth of
    /// Meute/Ronde/Troupe/Compagnie), with their current posts. Requires maitrise.manage.</summary>
    [HttpGet("candidates")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Candidates([FromQuery] string? search) => Ok(await Mediator.Send(new GetMaitriseCandidatesQuery(search)));

    /// <summary>Gives a member a leadership function today (a youth leaves their youth function today). Requires maitrise.manage.</summary>
    [HttpPost("add-now")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> AddNow([FromBody] AddMaitriseNowCommand command) => FromResult(await Mediator.Send(command));

    private IActionResult FromResult<T>(GNDJ.Application.Common.Models.Result<T> result)
        => result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });

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
