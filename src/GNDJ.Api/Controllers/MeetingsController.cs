using GNDJ.Application.Meetings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Séances / absences — unit &amp; team meetings/camps and attendance. Base route <c>api/v1/meetings</c>.
/// Authenticated; authorization is per-handler: a CU/CG (attendance.manage + unit) manages everything in their
/// units, and a chef d'équipe (a member holding an IsTeamLeader role) can create a pending séance for their team
/// and fill its attendance. So endpoints are [Authorize]-only and the handlers enforce the fine-grained access.
/// </summary>
[Authorize]
public class MeetingsController : BaseApiController
{
    /// <summary>The caller's attendance scope: units they manage + teams they lead. Drives the page.</summary>
    [HttpGet("scope")]
    public async Task<IActionResult> Scope()
        => Ok((await Mediator.Send(new GetAttendanceScopeQuery())).Value);

    /// <summary>Lists séances for a unit (CU: all; chef d'équipe: their team's only).</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid unitId)
    {
        var r = await Mediator.Send(new GetMeetingsQuery(unitId));
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>The roster + current absentees for one séance (to fill attendance).</summary>
    [HttpGet("{id:guid}/attendance")]
    public async Task<IActionResult> Attendance(Guid id)
    {
        var r = await Mediator.Send(new GetMeetingAttendanceQuery(id));
        return r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });
    }

    /// <summary>Per-member absence counts for a unit in a scout year (for the roster / CG list).</summary>
    [HttpGet("absence-counts")]
    public async Task<IActionResult> AbsenceCounts([FromQuery] Guid unitId, [FromQuery] string? scoutYear)
        => Ok((await Mediator.Send(new GetUnitAbsenceCountsQuery(unitId, scoutYear))).Value);

    /// <summary>Creates a séance (CU: approved; chef d'équipe for their team: pending CU approval).</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateMeetingCommand command)
    {
        var r = await Mediator.Send(command);
        return r.IsSuccess ? Ok(new { id = r.Value }) : BadRequest(new { error = r.Error });
    }

    /// <summary>CU/CG edits a séance's details (type/title/date/range/scope).</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMeetingCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var r = await Mediator.Send(command);
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }

    /// <summary>CU approves a pending (chef-d'équipe-created) séance.</summary>
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id)
    {
        var r = await Mediator.Send(new ApproveMeetingCommand(id));
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }

    /// <summary>Deletes a séance (CU, or the creator while it is still pending).</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var r = await Mediator.Send(new DeleteMeetingCommand(id));
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }

    /// <summary>Sets the absentee list for a séance (present = not in the list).</summary>
    [HttpPut("{id:guid}/attendance")]
    public async Task<IActionResult> SaveAttendance(Guid id, [FromBody] SaveMeetingAttendanceCommand command)
    {
        if (id != command.MeetingId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var r = await Mediator.Send(command);
        return r.IsSuccess ? NoContent() : BadRequest(new { error = r.Error });
    }
}
