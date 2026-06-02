using GNDJ.Api.Authorization;
using GNDJ.Application.Settings;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
public class SettingsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetSettingsQuery());
        return Ok(result);
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> GetByKey(string key)
    {
        var result = await Mediator.Send(new GetSettingQuery(key));
        if (result is null) return NotFound(new { error = "Paramètre introuvable." });
        return Ok(result);
    }

    [HttpPut("{key}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(string key, [FromBody] UpdateSettingCommand command)
    {
        if (key != command.Key) return BadRequest(new { error = "La clé ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
