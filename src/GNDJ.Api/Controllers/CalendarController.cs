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
        => OkOrBadRequest(await Mediator.Send(new GetCalendarQuery(from, to, unitId)));

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
        => OkIdOrBadRequest(await Mediator.Send(new CreateCalendarEventCommand(data)));

    /// <summary>Updates an event (the whole series for a repeating one).</summary>
    [HttpPut("events/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CalendarEventInput data)
        => NoContentOrBadRequest(await Mediator.Send(new UpdateCalendarEventCommand(id, data)));

    public record ImportantDateTimeBody(TimeOnly? StartTime, TimeOnly? EndTime);

    /// <summary>Sets (or clears) the start / end time of an important date (Passage, deadlines…). CG team only.</summary>
    [HttpPut("important-dates/{key}/time")]
    public async Task<IActionResult> SetImportantDateTime(string key, [FromBody] ImportantDateTimeBody body)
        => NoContentOrBadRequest(await Mediator.Send(new SetImportantDateTimeCommand(key, body.StartTime, body.EndTime)));

    /// <summary>Deletes an event (the whole series) and its public copy if it was published on the site.</summary>
    [HttpDelete("events/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
        => NoContentOrBadRequest(await Mediator.Send(new DeleteCalendarEventCommand(id)));

    public record CancelDateBody(DateOnly Date, bool Restore = false);

    /// <summary>Cancels (or restores) one date of a repeating event.</summary>
    [HttpPost("events/{id:guid}/cancel-date")]
    public async Task<IActionResult> CancelDate(Guid id, [FromBody] CancelDateBody body)
        => NoContentOrBadRequest(await Mediator.Send(new CancelCalendarOccurrenceCommand(id, body.Date, body.Restore)));

    public record EditDateBody(DateOnly Date, CalendarEventInput Data);

    /// <summary>« Modifier cette date seulement »: gives one occurrence of a repeating event its own details (the
    /// series skips that date, a one-off event replaces it). Returns the new event id.</summary>
    [HttpPost("events/{id:guid}/edit-date")]
    public async Task<IActionResult> EditDate(Guid id, [FromBody] EditDateBody body)
        => OkIdOrBadRequest(await Mediator.Send(new EditCalendarOccurrenceCommand(id, body.Date, body.Data)));

    public record FeedLinkBody(bool Reset = false);

    /// <summary>The caller's personal phone-calendar link token (created the first time; reset = a new one, the old
    /// link stops working). The client builds the URL.</summary>
    [HttpPost("feed-link")]
    public async Task<IActionResult> FeedLink([FromBody] FeedLinkBody body)
        => OkOrBadRequest(await Mediator.Send(new GetCalendarFeedLinkCommand(body.Reset)));

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
