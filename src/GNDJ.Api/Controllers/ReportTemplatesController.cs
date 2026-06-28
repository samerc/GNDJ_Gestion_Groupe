using GNDJ.Api.Authorization;
using GNDJ.Application.Reports;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// CG-defined report templates (CU generates reports from them).
// Route: api/v1/report-templates. [Authorize] = JWT/API-key.
// Read is MembersView (CUs list templates); write is AssociationsManage (CG-only).
[Authorize]
[Route("api/v1/report-templates")]
public class ReportTemplatesController : BaseApiController
{
    // activeOnly=true → only enabled templates (the CU picker); false → all (admin list).
    [HttpGet]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetAll([FromQuery] bool activeOnly = false)
    {
        var result = await Mediator.Send(new GetReportTemplatesQuery(activeOnly));
        return Ok(result);
    }

    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateReportTemplateCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/report-templates/{result.Value}", new { id = result.Value });
    }

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateReportTemplateCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteReportTemplateCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
