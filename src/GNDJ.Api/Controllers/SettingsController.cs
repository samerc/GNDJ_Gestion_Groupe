using GNDJ.Api.Authorization;
using GNDJ.Application.Settings;
using GNDJ.Domain.Enums;
using GNDJ.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace GNDJ.Api.Controllers;

[Authorize]
public class SettingsController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)]
    [OutputCache(PolicyName = "LookupData")]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetSettingsQuery());
        return Ok(result);
    }

    [HttpGet("{key}")]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> GetByKey(string key)
    {
        var result = await Mediator.Send(new GetSettingQuery(key));
        if (result is null) return NotFound(new { error = "Paramètre introuvable." });
        return Ok(result);
    }

    [HttpPut("{key}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(string key, [FromBody] UpdateSettingCommand command,
        [FromServices] ISettingsCacheService settingsCache, [FromServices] IOutputCacheStore outputCache)
    {
        if (key != command.Key) return BadRequest(new { error = "La clé ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        settingsCache.Invalidate();
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return NoContent();
    }

    // Managed cities list — editable by a Chef de Groupe (maitrise.manage) as well as super-admin,
    // unlike the system settings above which require associations.manage.
    [HttpPut("cities")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> UpdateCities([FromBody] UpdateCitiesCommand command,
        [FromServices] ISettingsCacheService settingsCache, [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        settingsCache.Invalidate();
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return NoContent();
    }
}
