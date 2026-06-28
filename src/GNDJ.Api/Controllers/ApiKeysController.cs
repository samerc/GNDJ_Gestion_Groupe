using GNDJ.Api.Authorization;
using GNDJ.Application.ApiKeys;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// External API-key management — base route api/v1/api-keys (overrides the [controller] default).
// [Authorize] = JWT or API-key required; every action gated by AssociationsManage (no dedicated key family — admin-only).
[Authorize]
[Route("api/v1/api-keys")]
public class ApiKeysController : BaseApiController
{
    [HttpGet]
    [HasPermission(Permissions.AssociationsManage)] // Admin-only
    public async Task<IActionResult> GetAll()
    {
        var result = await Mediator.Send(new GetApiKeysQuery());
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateApiKeyCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", result.Value); // returns the plaintext key ONCE — only the hash is stored

    }

    // /{id}/toggle — flips active state; returns the new isActive (not 204) so the UI can reflect it without a refetch.
    [HttpPut("{id:guid}/toggle")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var result = await Mediator.Send(new ToggleApiKeyCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { isActive = result.Value });
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteApiKeyCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
