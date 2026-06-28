using GNDJ.Api.Authorization;
using GNDJ.Application.Rentree;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Rentrée scoute startup checklist (per-year tasks from an editable template). Route api/v1/rentree.
// Read endpoints are auth-only so the checklist is visible to every member; template/generate/task management
// is gated by rentree.manage (super-admin + Chef de Groupe).
[Authorize]
public class RentreeController : BaseApiController
{
    // ── Read (any authenticated member — the checklist is visible to all) ──
    [HttpGet("years")]
    public async Task<IActionResult> Years() => Ok(await Mediator.Send(new GetRentreeYearsQuery()));

    [HttpGet("tasks")]
    public async Task<IActionResult> Tasks([FromQuery] string scoutYear, [FromQuery] bool mineOnly = false)
        => Ok(await Mediator.Send(new GetRentreeTasksQuery(scoutYear, mineOnly)));

    [HttpGet("my-overdue")]
    public async Task<IActionResult> MyOverdue() => Ok(await Mediator.Send(new GetMyOverdueRentreeTasksQuery()));

    [HttpPost("tasks/{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteBody body)
    {
        var result = await Mediator.Send(new CompleteRentreeTaskCommand(id, body.Done));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }
    public record CompleteBody(bool Done);

    // ── Manage (super-admin + Chef de Groupe) ──
    [HttpGet("templates")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> Templates() => Ok(await Mediator.Send(new GetRentreeTemplatesQuery()));

    [HttpPost("templates")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> SaveTemplate([FromBody] SaveRentreeTemplateCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });
    }

    [HttpDelete("templates/{id:guid}")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> DeleteTemplate(Guid id)
    {
        var result = await Mediator.Send(new DeleteRentreeTemplateCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    [HttpPut("templates/reorder")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> ReorderTemplates([FromBody] ReorderRentreeTemplatesCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    // Copies the template → this year's tasks, fanning out per-unit role tasks into one task per active unit
    // and resolving assignees + dependencies. Returns the count created.
    [HttpPost("generate")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> Generate([FromBody] GenerateRentreeChecklistCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { created = result.Value }) : BadRequest(new { error = result.Error });
    }

    [HttpPut("tasks/{id:guid}")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> UpdateTask(Guid id, [FromBody] UpdateRentreeTaskCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "Identifiant incohérent." });
        var result = await Mediator.Send(command);
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    [HttpDelete("tasks/{id:guid}")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> DeleteTask(Guid id)
    {
        var result = await Mediator.Send(new DeleteRentreeTaskCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }
}
