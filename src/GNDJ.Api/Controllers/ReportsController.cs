using GNDJ.Api.Authorization;
using GNDJ.Application.Reports;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

[Authorize]
[Route("api/v1/reports")]
public class ReportsController : BaseApiController
{
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
}
