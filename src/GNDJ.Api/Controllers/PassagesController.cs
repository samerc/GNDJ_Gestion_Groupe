using GNDJ.Application.Passages;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Annual passage workflow: members move unit/team/role between scout years. Route api/v1/passages. Auth is JWT or API-key.
/// Status flow Pending -&gt; Approved -&gt; Finalized (or Rejected). CU proposes (passage.propose), CG reviews/finalizes
/// (passage.manage), read is passage.view. The scoutYear query param is required on all read endpoints (a round is scoped to one year).
/// </summary>
[Authorize]
[Route("api/v1/passages")]
public class PassagesController : BaseApiController
{
    /// <summary>CU view: passage proposals for one unit. Requires passage.view.</summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    [HttpGet("unit/{unitId:guid}")]
    [HasPermission(Permissions.PassageView)]
    public async Task<IActionResult> GetPassagesByUnit(Guid unitId, [FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetPassagesByUnitQuery(unitId, scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>CG review list across all units, with optional status/unit filters. Requires passage.manage.</summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    /// <param name="status">Optional status filter (e.g. Pending, Approved, Rejected, Finalized).</param>
    /// <param name="unitId">Optional unit filter.</param>
    [HttpGet]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetAllPassages([FromQuery] string scoutYear, [FromQuery] string? status, [FromQuery] Guid? unitId)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetAllPassagesQuery(scoutYear, status, unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>CG completeness view: expected vs. missing passage lines per unit (finalize gate). Requires passage.manage.</summary>
    /// <param name="scoutYear">Required scout year scoping the round.</param>
    [HttpGet("summary")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> GetPassageSummary([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetPassageSummaryQuery(scoutYear));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Reports whether the CG has opened the passage round for the year. Auth-only (no permission required).</summary>
    /// <param name="scoutYear">Scout year to check.</param>
    [HttpGet("status")]
    public async Task<IActionResult> IsPassageOpen([FromQuery] string scoutYear)
    {
        var result = await Mediator.Send(new IsPassageOpenQuery(scoutYear ?? string.Empty));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>CU proposes a passage change for one member. Requires passage.propose.</summary>
    /// <response code="201">Proposal created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.PassagePropose)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Propose([FromBody] ProposePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/passages/{result.Value}", new { id = result.Value });
    }

    /// <summary>Bulk CU propose (e.g. "Pas de changement" for many members at once); returns the processed count. Requires passage.propose.</summary>
    [HttpPost("bulk")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> BulkPropose([FromBody] BulkProposePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>CG reviews a proposal: modify/approve/reject (validates the final team belongs to the final unit). Requires passage.manage.</summary>
    [HttpPut("{id:guid}/review")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewPassageCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>CG bulk approve/reject of proposals; returns the processed count. Requires passage.manage.</summary>
    [HttpPost("bulk-review")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> BulkReview([FromBody] BulkReviewPassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>
    /// CG finalize: ends old assignments and creates new ones for all Approved lines; returns the count finalized. Requires passage.manage.
    /// Serialized via a Postgres advisory lock and idempotent (double-click / two-CG safe); blocked until every active member in scope has a line.
    /// </summary>
    [HttpPost("finalize")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Finalize([FromBody] FinalizePassagesCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>CG opens or closes the passage process for the year (gates CU proposals). Requires passage.manage.</summary>
    [HttpPost("toggle")]
    [HasPermission(Permissions.PassageManage)]
    public async Task<IActionResult> Toggle([FromBody] TogglePassageCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Deletes a passage proposal line. Requires passage.propose.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.PassagePropose)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeletePassageCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
