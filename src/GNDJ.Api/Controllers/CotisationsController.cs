using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Cotisations;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/cotisations")]
public class CotisationsController : BaseApiController
{
    // No permission attribute — any authenticated user can view their own cotisations.
    // Handler checks unit-scoped access for CU viewing other members.
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> GetMemberCotisations(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberCotisationsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    [HttpPost]
    [HasPermission(Permissions.CotisationsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateCotisationCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/cotisations/{result.Value!.Id}", result.Value);
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.CotisationsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCotisationCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // Mark/unmark a member as exempt ("ne paiera pas") for a scout year. CU or CG; shared flag.
    [HttpPut("exempt")]
    [HasPermission(Permissions.CotisationsEdit)]
    public async Task<IActionResult> SetExempt([FromBody] SetCotisationExemptCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.CotisationsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteCotisationCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // No permission attribute — members can download their own receipts.
    [HttpGet("{id:guid}/receipt")]
    public async Task<IActionResult> DownloadReceipt(Guid id, [FromServices] IReceiptService receiptService)
    {
        var result = await Mediator.Send(new GetReceiptDataQuery(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        var pdf = receiptService.GenerateReceipt(result.Value!);
        return File(pdf, "application/pdf", $"Recu_{result.Value!.ReceiptNumber}.pdf");
    }

    [HttpGet("unpaid")]
    [HasPermission(Permissions.CotisationsView)]
    public async Task<IActionResult> GetUnpaid([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetUnpaidCotisationsQuery(scoutYear));
        return Ok(result);
    }

    [HttpGet("summary")]
    [HasPermission(Permissions.CotisationsView)]
    public async Task<IActionResult> GetSummary([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetCotisationSummaryQuery(scoutYear));
        return Ok(result);
    }
}
