using GNDJ.Api.Authorization;
using GNDJ.Application.Reports;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// PDF / Excel / CSV report generation (trombinoscope, member cards, roster, export), base route <c>api/v1/reports</c>.
/// Authenticated via JWT or API key; every action requires members.view and streams a binary File response
/// (PDF or spreadsheet), not JSON.
/// </summary>
[Authorize]
[Route("api/v1/reports")]
public class ReportsController : BaseApiController
{
    /// <summary>Generates the trombinoscope PDF (A4/A3 photo grid). Body carries the unit/team/column selection. Requires members.view.</summary>
    [HttpPost("trombinoscope")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Trombinoscope([FromBody] GenerateTrombinoscoreQuery query)
    {
        var result = await Mediator.Send(query);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        return File(result.Value!.Data, "application/pdf", result.Value.FileName);
    }

    /// <summary>Saves (freezes) the trombinoscope for a unit + scout year so members see it with that year's photos. Requires members.edit.</summary>
    [HttpPost("trombinoscope/archive")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> ArchiveTrombinoscope([FromBody] ArchiveTrombinoscoreCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Whether a saved trombinoscope exists for a unit + scout year (and when it was saved). Requires members.edit.</summary>
    [HttpGet("trombinoscope/archive")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> TrombinoscopeArchiveInfo([FromQuery] Guid unitId, [FromQuery] string scoutYear)
    {
        var result = await Mediator.Send(new GetTrombinoscoreArchiveInfoQuery(unitId, scoutYear ?? ""));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Publishes/unpublishes a saved trombinoscope (member visibility) without regenerating it. Requires members.edit.</summary>
    [HttpPost("trombinoscope/archive/publish")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> SetTrombinoscopePublished([FromBody] SetTrombinoscorePublishedCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Re-downloads the saved trombinoscope PDF for a unit + scout year. Requires members.edit.</summary>
    [HttpGet("trombinoscope/archive/download")]
    [HasPermission(Permissions.MembersEdit)]
    public async Task<IActionResult> DownloadTrombinoscopeArchive([FromQuery] Guid unitId, [FromQuery] string scoutYear)
    {
        var result = await Mediator.Send(new DownloadTrombinoscoreArchiveQuery(unitId, scoutYear ?? ""));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!.Data, "application/pdf", result.Value.FileName);
    }

    /// <summary>Generates a single member's credit-card-sized card PDF. Requires members.view.</summary>
    [HttpGet("member-card/{memberId:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> MemberCard(Guid memberId)
    {
        var result = await Mediator.Send(new GenerateMemberCardQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!, "application/pdf", "Carte_Membre.pdf");
    }

    /// <summary>Generates a bulk member-card PDF (10 cards per A4 page with cut lines) for every member of the unit. Requires members.view.</summary>
    [HttpGet("bulk-cards/{unitId:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> BulkCards(Guid unitId)
    {
        var result = await Mediator.Send(new GenerateBulkCardsQuery(unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!, "application/pdf", $"Cartes_Membres_{DateTime.Now:yyyyMMdd}.pdf");
    }

    /// <summary>Generates the roster PDF (A4 landscape, selectable columns, grouped by team). Requires members.view.</summary>
    [HttpPost("roster")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Roster([FromBody] GenerateRosterQuery query)
    {
        var result = await Mediator.Send(query);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!, "application/pdf", $"Liste_{DateTime.Now:yyyyMMdd}.pdf");
    }

    /// <summary>Generates a member data export as an Excel (.xlsx) or CSV file; format and content-type come from the query result. Requires members.view.</summary>
    [HttpPost("export")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Export([FromBody] GenerateExportQuery query)
    {
        var result = await Mediator.Send(query);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!.Data, result.Value.ContentType, result.Value.FileName);
    }
}
