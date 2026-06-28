using GNDJ.Api.Authorization;
using GNDJ.Application.Reports;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// CG-defined report templates that CUs generate reports from, base route <c>api/v1/report-templates</c>.
/// Authenticated via JWT or API key. Reading requires members.view (CUs list templates); writing requires
/// associations.manage (CG-only).
/// </summary>
[Authorize]
[Route("api/v1/report-templates")]
public class ReportTemplatesController : BaseApiController
{
    /// <summary>Lists report templates. Requires members.view.</summary>
    /// <param name="activeOnly">When true, returns only enabled templates (the CU picker); otherwise all (admin list).</param>
    [HttpGet]
    [HasPermission(Permissions.MembersView)]
    public async Task<IActionResult> GetAll([FromQuery] bool activeOnly = false)
    {
        var result = await Mediator.Send(new GetReportTemplatesQuery(activeOnly));
        return Ok(result);
    }

    /// <summary>Creates a report template. Requires associations.manage.</summary>
    /// <response code="201">Template created; body carries the new id.</response>
    [ProducesResponseType(201)]
    [HttpPost]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Create([FromBody] CreateReportTemplateCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/report-templates/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates a report template. Requires associations.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateReportTemplateCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes a report template. Requires associations.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteReportTemplateCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
