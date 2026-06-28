using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Cotisations;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Member dues (cotisations) per scout year. Base route api/v1/cotisations; requires authentication (JWT/API-key).
/// Mutations require cotisations.create/edit/delete; the unpaid list and summary require cotisations.view.
/// Member-read and receipt download are auth-only (own data, unit-scoped in the handler).
/// </summary>
[Authorize]
[Route("api/v1/cotisations")]
public class CotisationsController : BaseApiController
{
    /// <summary>
    /// Lists a member's cotisations. Auth-only: any user can view their own; a unit leader can view members in
    /// their unit (unit-scoped access enforced in the handler).
    /// </summary>
    // No permission attribute — any authenticated user can view their own cotisations.
    // Handler checks unit-scoped access for CU viewing other members.
    [HttpGet("member/{memberId:guid}")]
    public async Task<IActionResult> GetMemberCotisations(Guid memberId)
    {
        var result = await Mediator.Send(new GetMemberCotisationsQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Creates a cotisation (with payment lines) for a member and scout year. Requires cotisations.create.</summary>
    [HttpPost]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.CotisationsCreate)]
    public async Task<IActionResult> Create([FromBody] CreateCotisationCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/cotisations/{result.Value!.Id}", result.Value);
    }

    /// <summary>Updates an existing cotisation. Requires cotisations.edit.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.CotisationsEdit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCotisationCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>
    /// Marks or unmarks a member as exempt ("ne paiera pas") for a scout year. Shared CU/CG flag. Requires cotisations.edit.
    /// </summary>
    [HttpPut("exempt")]
    [HasPermission(Permissions.CotisationsEdit)]
    public async Task<IActionResult> SetExempt([FromBody] SetCotisationExemptCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a cotisation. Requires cotisations.delete.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.CotisationsDelete)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteCotisationCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>
    /// Generates and returns the cotisation receipt as a PDF file. Auth-only: members can download their own receipts.
    /// </summary>
    // No permission attribute — members can download their own receipts.
    [HttpGet("{id:guid}/receipt")]
    public async Task<IActionResult> DownloadReceipt(Guid id, [FromServices] IReceiptService receiptService)
    {
        var result = await Mediator.Send(new GetReceiptDataQuery(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        var pdf = receiptService.GenerateReceipt(result.Value!);
        return File(pdf, "application/pdf", $"Recu_{result.Value!.ReceiptNumber}.pdf");
    }

    /// <summary>Lists members with no (and non-exempt) cotisation for the given scout year. Requires cotisations.view.</summary>
    /// <param name="scoutYear">Required scout year (e.g. "2025-2026").</param>
    [HttpGet("unpaid")]
    [HasPermission(Permissions.CotisationsView)]
    public async Task<IActionResult> GetUnpaid([FromQuery] string scoutYear)
    {
        if (string.IsNullOrWhiteSpace(scoutYear))
            return BadRequest(new { error = "L'année scoute est requise." });
        var result = await Mediator.Send(new GetUnpaidCotisationsQuery(scoutYear));
        return Ok(result);
    }

    /// <summary>Returns cotisation totals for the scout year (paid / unpaid / exempt counts). Requires cotisations.view.</summary>
    /// <param name="scoutYear">Required scout year (e.g. "2025-2026").</param>
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
