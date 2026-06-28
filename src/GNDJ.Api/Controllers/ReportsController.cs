using GNDJ.Api.Authorization;
using GNDJ.Application.Reports;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// PDF / Excel / CSV report generation (trombinoscope, member cards, roster, export).
// Route: api/v1/reports. [Authorize] = JWT/API-key. All actions gated on MembersView;
// every action streams a binary File() response (PDF or spreadsheet), not JSON.
[Authorize]
[Route("api/v1/reports")]
public class ReportsController : BaseApiController
{
    // A4/A3 photo grid PDF. POST body carries unit/team/column selection.
    [HttpPost("trombinoscope")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Trombinoscope([FromBody] GenerateTrombinoscoreQuery query)
    {
        var result = await Mediator.Send(query);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });

        return File(result.Value!, "application/pdf", $"Trombinoscope_{DateTime.Now:yyyyMMdd}.pdf");
    }

    [HttpGet("member-card/{memberId:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> MemberCard(Guid memberId)
    {
        var result = await Mediator.Send(new GenerateMemberCardQuery(memberId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!, "application/pdf", "Carte_Membre.pdf");
    }

    // 10 cards per A4 page (cut lines) for every member of the unit.
    [HttpGet("bulk-cards/{unitId:guid}")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> BulkCards(Guid unitId)
    {
        var result = await Mediator.Send(new GenerateBulkCardsQuery(unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!, "application/pdf", $"Cartes_Membres_{DateTime.Now:yyyyMMdd}.pdf");
    }

    [HttpPost("roster")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Roster([FromBody] GenerateRosterQuery query)
    {
        var result = await Mediator.Send(query);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!, "application/pdf", $"Liste_{DateTime.Now:yyyyMMdd}.pdf");
    }

    // Excel (.xlsx) or CSV export; format + content-type chosen by the query result.
    [HttpPost("export")]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> Export([FromBody] GenerateExportQuery query)
    {
        var result = await Mediator.Send(query);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!.Data, result.Value.ContentType, result.Value.FileName);
    }
}
