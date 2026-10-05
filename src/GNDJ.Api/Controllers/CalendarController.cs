using GNDJ.Application.Calendar;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// The group calendar (base route api/v1/calendar). Auth-only: every handler builds the viewer from the signed-in
/// member's posts and filters / checks there (members see their group, branch, unit, maîtrise events; a chef d'unité
/// edits only their unit's; the Chef de Groupe team edits everything). The .ics feed is anonymous — its token is the
/// authorization.
/// </summary>
[Authorize]
[Route("api/v1/calendar")]
public class CalendarController : BaseApiController
{
    /// <summary>Everything the caller sees between two dates (max 400 days): events (repeats expanded), réunions /
    /// sorties / camps of their units, and the year's important dates. unitId: a manager also sees that unit's réunions.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] Guid? unitId)
    {
        var result = await Mediator.Send(new GetCalendarQuery(from, to, unitId));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>What the caller may create (audiences, units, branches) — for the event form.</summary>
    [HttpGet("options")]
    public async Task<IActionResult> Options() => Ok(await Mediator.Send(new GetCalendarOptionsQuery()));

    /// <summary>One event in full (for the edit form).</summary>
    [HttpGet("events/{id:guid}")]
    public async Task<IActionResult> GetEvent(Guid id)
    {
        var result = await Mediator.Send(new GetCalendarEventQuery(id));
        if (!result.IsSuccess) return NotFound(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>Creates an event (group / branch / maîtrise / CG team: Chef de Groupe team; unit: that unit's chefs).</summary>
    [HttpPost("events")]
    public async Task<IActionResult> Create([FromBody] CalendarEventInput data)
    {
        var result = await Mediator.Send(new CreateCalendarEventCommand(data));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { id = result.Value });
    }

    /// <summary>Updates an event (the whole series for a repeating one).</summary>
    [HttpPut("events/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CalendarEventInput data)
    {
        var result = await Mediator.Send(new UpdateCalendarEventCommand(id, data));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes an event (the whole series) and its public copy if it was published on the site.</summary>
    [HttpDelete("events/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteCalendarEventCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    public record CancelDateBody(DateOnly Date, bool Restore = false);

    /// <summary>Cancels (or restores) one date of a repeating event.</summary>
    [HttpPost("events/{id:guid}/cancel-date")]
    public async Task<IActionResult> CancelDate(Guid id, [FromBody] CancelDateBody body)
    {
        var result = await Mediator.Send(new CancelCalendarOccurrenceCommand(id, body.Date, body.Restore));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    public record FeedLinkBody(bool Reset = false);

    /// <summary>The caller's personal phone-calendar link token (created the first time; reset = a new one, the old
    /// link stops working). The client builds the URL.</summary>
    [HttpPost("feed-link")]
    public async Task<IActionResult> FeedLink([FromBody] FeedLinkBody body)
    {
        var result = await Mediator.Send(new GetCalendarFeedLinkCommand(body.Reset));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }

    /// <summary>The .ics a phone calendar subscribes to (anonymous; the secret token is the authorization).</summary>
    [AllowAnonymous]
    [HttpGet("feed/{token}.ics")]
    public async Task<IActionResult> Feed(string token)
    {
        var ics = await Mediator.Send(new GetCalendarIcsQuery(token));
        if (ics is null) return NotFound();
        return File(System.Text.Encoding.UTF8.GetBytes(ics), "text/calendar; charset=utf-8", "gndj.ics");
    }
}
