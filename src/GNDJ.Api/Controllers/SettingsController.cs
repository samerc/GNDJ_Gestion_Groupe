using GNDJ.Api.Authorization;
using GNDJ.Application.Settings;
using GNDJ.Domain.Enums;
using GNDJ.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Key-value application settings. Base route api/v1/settings. Requires authentication (JWT or API key).
/// Most reads/writes need associations.manage (admin); GetByKey is open to any authenticated user.
/// UpdateSetting validates Value against the setting's ValueType and busts the settings + output caches.
/// The cities list is an exception, editable with maitrise.manage so a Chef de Groupe can curate it.
/// </summary>
[Authorize]
public class SettingsController : BaseApiController
{
    /// <summary>Lists all settings. Requires associations.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)]
    [OutputCache(PolicyName = "LookupData")]
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetSettingsQuery());
        return Ok(result);
    }

    /// <summary>Resolves a single setting by key. Open to any authenticated user.</summary>
    /// <param name="key">The setting key to look up.</param>
    /// <response code="404">No setting exists for the given key.</response>
    [HttpGet("{key}")]
    [ProducesResponseType(404)]
    [OutputCache(PolicyName = "ShortCache")]
    public async Task<IActionResult> GetByKey(string key)
    {
        var result = await Mediator.Send(new GetSettingQuery(key));
        if (result is null) return NotFound(new { error = "Paramètre introuvable." });
        return Ok(result);
    }

    /// <summary>
    /// Updates a setting's value (validated against its ValueType) and busts the caches; the route key must match
    /// the command body's Key. Requires associations.manage.
    /// </summary>
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

    /// <summary>
    /// Updates the managed cities list and busts the caches. Requires maitrise.manage (Chef de Groupe or super-admin),
    /// unlike the system settings above which require associations.manage.
    /// </summary>
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
