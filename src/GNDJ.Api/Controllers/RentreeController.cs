using GNDJ.Api.Authorization;
using GNDJ.Application.Rentree;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Rentrée scoute startup checklist — per-year tasks generated from an editable template, base route <c>api/v1/rentree</c>.
/// Authenticated. Read endpoints are auth-only so the checklist is visible to every member; template/generate/task
/// management is gated by rentree.manage (super-admin + Chef de Groupe).
/// </summary>
[Authorize]
public class RentreeController : BaseApiController
{
    // ── Read (any authenticated member — the checklist is visible to all) ──
    /// <summary>Lists the scout years for which a checklist has been generated.</summary>
    [HttpGet("years")]
    public async Task<IActionResult> Years() => Ok(await Mediator.Send(new GetRentreeYearsQuery()));

    /// <summary>Lists the checklist tasks for a scout year (rolled up per unit). Non-managers always see only their own tasks.</summary>
    /// <param name="scoutYear">The scout year to list tasks for.</param>
    /// <param name="mineOnly">When true, restricts to the caller's own tasks.</param>
    [HttpGet("tasks")]
    public async Task<IActionResult> Tasks([FromQuery] string scoutYear, [FromQuery] bool mineOnly = false)
        => Ok(await Mediator.Send(new GetRentreeTasksQuery(scoutYear, mineOnly)));

    /// <summary>Lists the caller's own tasks past their fixed due date (drives the login popup).</summary>
    [HttpGet("my-overdue")]
    public async Task<IActionResult> MyOverdue() => Ok(await Mediator.Send(new GetMyOverdueRentreeTasksQuery()));

    /// <summary>Marks a task done or not done (assignee or CG). Blocked while an unfinished prerequisite remains.</summary>
    [HttpPost("tasks/{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteBody body)
    {
        var result = await Mediator.Send(new CompleteRentreeTaskCommand(id, body.Done));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }
    public record CompleteBody(bool Done);

    // ── Manage (super-admin + Chef de Groupe) ──
    /// <summary>Lists the master task templates. Requires rentree.manage.</summary>
    [HttpGet("templates")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> Templates() => Ok(await Mediator.Send(new GetRentreeTemplatesQuery()));

    /// <summary>Creates or updates a task template. Requires rentree.manage.</summary>
    [HttpPost("templates")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> SaveTemplate([FromBody] SaveRentreeTemplateCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });
    }

    /// <summary>Deletes a task template. Requires rentree.manage.</summary>
    [HttpDelete("templates/{id:guid}")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> DeleteTemplate(Guid id)
    {
        var result = await Mediator.Send(new DeleteRentreeTemplateCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Reorders the task templates. Requires rentree.manage.</summary>
    [HttpPut("templates/reorder")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> ReorderTemplates([FromBody] ReorderRentreeTemplatesCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>
    /// Generates the year's tasks from the template — fanning out per-unit role tasks into one per active unit and
    /// resolving assignees + dependencies — and returns the count created. Requires rentree.manage.
    /// </summary>
    [HttpPost("generate")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> Generate([FromBody] GenerateRentreeChecklistCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { created = result.Value }) : BadRequest(new { error = result.Error });
    }

    /// <summary>Edits a generated task (title/description/deadline). Requires rentree.manage.</summary>
    [HttpPut("tasks/{id:guid}")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> UpdateTask(Guid id, [FromBody] UpdateRentreeTaskCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "Identifiant incohérent." });
        var result = await Mediator.Send(command);
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Deletes a generated task. Requires rentree.manage.</summary>
    [HttpDelete("tasks/{id:guid}")]
    [HasPermission(Permissions.RentreeManage)]
    public async Task<IActionResult> DeleteTask(Guid id)
    {
        var result = await Mediator.Send(new DeleteRentreeTaskCommand(id));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }
}
