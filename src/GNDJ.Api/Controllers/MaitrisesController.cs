using GNDJ.Api.Authorization;
using GNDJ.Application.Maitrises;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/maitrises")]
public class MaitrisesController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Get()
    {
        var result = await Mediator.Send(new GetMaitrisesQuery());
        return Ok(result);
    }

    [HttpPost("remove")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Remove([FromBody] RemoveFromMaitriseCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPost("transfer")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Transfer([FromBody] TransferMaitriseCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
