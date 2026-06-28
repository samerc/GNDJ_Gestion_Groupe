using GNDJ.Api.Authorization;
using GNDJ.Application.ApiKeys;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// External API-key management. Base route api/v1/api-keys. Requires JWT or API-key auth; every action is
/// admin-only (requires associations.manage).
/// </summary>
[Authorize]
[Route("api/v1/api-keys")]
public class ApiKeysController : BaseApiController
{
    /// <summary>Lists all API keys (hashes withheld). Requires associations.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)] // Admin-only
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetApiKeysQuery());
        return Ok(result);
    }

    /// <summary>
    /// Creates an API key and returns the plaintext key once (only the hash is stored thereafter).
    /// Requires associations.manage.
    /// </summary>
    [ProducesResponseType(201)]
    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateApiKeyCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", result.Value); // returns the plaintext key ONCE — only the hash is stored

    }

    /// <summary>
    /// Toggles the key's active state and returns the new isActive value (so the UI can reflect it without a refetch).
    /// Requires associations.manage.
    /// </summary>
    [HttpPut("{id:guid}/toggle")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var result = await Mediator.Send(new ToggleApiKeyCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { isActive = result.Value });
    }

    /// <summary>Deletes an API key. Requires associations.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteApiKeyCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
