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
/// Access is per-category (see SettingsAccess): a full admin (associations.manage) reads/writes every
/// setting; a Chef de Groupe (maitrise.manage) reads/writes only the operational categories. GetByKey is
/// open to any authenticated user. UpdateSetting validates Value against the setting's ValueType and busts
/// the settings + output caches. The managed member-data lists are editable with maitrise.manage too.
/// </summary>
[Authorize]
public class SettingsController : BaseApiController
{
    /// <summary>
    /// Lists settings the caller may edit: a full admin (associations.manage) sees everything; a Chef de
    /// Groupe (maitrise.manage) sees only the operational categories. Not output-cached (varies by user).
    /// </summary>
    [HttpGet]
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
    /// the command body's Key. Per-category access is enforced in the handler: admins edit anything, a Chef de
    /// Groupe only the operational categories (403 otherwise).
    /// </summary>
    [HttpPut("{key}")]
    public async Task<IActionResult> Update(string key, [FromBody] UpdateSettingCommand command,
        [FromServices] IOutputCacheStore outputCache)
    {
        if (key != command.Key) return BadRequest(new { error = "La clé ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
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
        [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return NoContent();
    }

    /// <summary>
    /// Usage counts for a json_array list setting: active + archived values, each with how many member/parent
    /// records currently hold it (managed keys only — schools/classes/cities/profession domains). Requires associations.manage.
    /// </summary>
    /// <param name="key">The list setting key (e.g. member.schools).</param>
    [HttpGet("list-usage/{key}")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> GetListUsage(string key)
    {
        var result = await Mediator.Send(new GetListValueUsageQuery(key));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>
    /// Renames a value in a list setting, cascading the new spelling onto every member/parent record that holds it
    /// (managed keys). Returns the number of records updated. Requires associations.manage.
    /// </summary>
    [HttpPost("list-value/rename")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> RenameListValue([FromBody] RenameListValueCommand command,
        [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return Ok(new { affected = result.Value });
    }

    /// <summary>
    /// Deletes a value from a list setting. An in-use value (managed keys) is archived — hidden from pickers but kept
    /// on the records that hold it; an unused value is hard-removed. Returns archived=true/false. Requires associations.manage.
    /// </summary>
    [HttpPost("list-value/archive")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> ArchiveListValue([FromBody] DeleteListValueCommand command,
        [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return Ok(new { archived = result.Value });
    }

    /// <summary>Adds a value to a list setting (member-data lists are Chef-de-Groupe-accessible). Requires maitrise.manage (scoped by the handler).</summary>
    [HttpPost("list-value/add")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> AddListValue([FromBody] AddListValueCommand command,
        [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return Ok(new { added = result.Value });
    }

    /// <summary>Restores an archived list value back into the active list. Requires maitrise.manage (scoped by the handler).</summary>
    [HttpPost("list-value/unarchive")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> UnarchiveListValue([FromBody] UnarchiveListValueCommand command,
        [FromServices] IOutputCacheStore outputCache)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        await outputCache.EvictByTagAsync("lookup", default);
        await outputCache.EvictByTagAsync("short", default);
        return NoContent();
    }
}
