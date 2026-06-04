using GNDJ.Application.Passages;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/passages")]
public class PassagesController : BaseApiController
{
    [HttpGet("unit/{unitId:guid}")]
    [HasPermission(Permissions.PassageView)]
    public async Task<IActionResult> GetPassagesByUnit(Guid unitId, [FromQuery] string schoolYear)
    {
        if (string.IsNullOrWhiteSpace(schoolYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetPassagesByUnitQuery(unitId, schoolYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpGet]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetAllPassages([FromQuery] string schoolYear, [FromQuery] string? status, [FromQuery] Guid? unitId)
    {
        if (string.IsNullOrWhiteSpace(schoolYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetAllPassagesQuery(schoolYear, status, unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpGet("summary")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetPassageSummary([FromQuery] string schoolYear)
    {
        if (string.IsNullOrWhiteSpace(schoolYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetPassageSummaryQuery(schoolYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpGet("status")]
    public async Task<IActionResult> IsPassageOpen([FromQuery] string schoolYear)
    {
        var result = await Mediator.Send(new IsPassageOpenQuery(schoolYear ?? string.Empty));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> Propose([FromBody] ProposePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/passages/{result.Value}", new { id = result.Value });
    }

    [HttpPost("bulk")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> BulkPropose([FromBody] BulkProposePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    [HttpPut("{id:guid}/review")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewPassageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpPost("bulk-review")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> BulkReview([FromBody] BulkReviewPassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    [HttpPost("finalize")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Finalize([FromBody] FinalizePassagesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    [HttpPost("toggle")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Toggle([FromBody] TogglePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeletePassageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
