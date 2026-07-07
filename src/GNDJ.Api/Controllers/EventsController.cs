using GNDJ.Api.Authorization;
using GNDJ.Application.Events;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Admin CMS for public calendar events (Agenda). Route api/v1/events.
/// All actions require the content.manage permission (the public agenda lives on PublicController).
/// </summary>
[Authorize]
[Route("api/v1/events")]
public class EventsController : BaseApiController
{
    /// <summary>Lists all events for the admin (published and drafts, newest date first). Requires content.manage.</summary>
    [HttpGet]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> GetAll()
        => Ok(await Mediator.Send(new GetEventsAdminQuery()));

    /// <summary>Gets a single event by id for editing. Requires content.manage.</summary>
    /// <response code="404">No event with this id.</response>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await Mediator.Send(new GetEventByIdQuery(id));
        if (result is null) return NotFound(new { error = "Événement introuvable." });
        return Ok(result);
    }

    /// <summary>Creates an event (auto-slug from title, auto-excerpt from body). Requires content.manage.</summary>
    /// <response code="201">Event created; body contains the new id.</response>
    [HttpPost]
    [HasPermission(Permissions.ContentManage)]
    [ProducesResponseType(201)]
    public async Task<IActionResult> Create([FromBody] CreateEventCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created($"/api/v1/events/{result.Value}", new { id = result.Value });
    }

    /// <summary>Updates an event. Requires content.manage.</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEventCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes an event. Requires content.manage.</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.ContentManage)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var result = await Mediator.Send(new DeleteEventCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
