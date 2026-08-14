using GNDJ.Api.Authorization;
using GNDJ.Application.Email;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Email infrastructure admin: SMTP servers and email templates. Base route api/v1/email; requires authentication
/// (JWT/API-key). Every action requires associations.manage.
/// </summary>
[Authorize]
[Route("api/v1/email")]
public class EmailController : BaseApiController
{
    /// <summary>Lists configured SMTP servers. Requires associations.manage.</summary>
    [HttpGet("smtp-servers")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetSmtpServers()
    {
        var result = await Mediator.Send(new GetSmtpServersQuery());
        return Ok(result);
    }

    /// <summary>Creates an SMTP server configuration. Requires associations.manage.</summary>
    [HttpPost("smtp-servers")]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> CreateSmtpServer([FromBody] CreateSmtpServerCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Updates an SMTP server configuration. Requires associations.manage.</summary>
    [HttpPut("smtp-servers/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> UpdateSmtpServer(Guid id, [FromBody] UpdateSmtpServerCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes an SMTP server configuration. Requires associations.manage.</summary>
    [HttpDelete("smtp-servers/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> DeleteSmtpServer(Guid id)
    {
        var result = await Mediator.Send(new DeleteSmtpServerCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>
    /// Sends a live test email through the stored SMTP config to verify credentials/connectivity.
    /// Requires associations.manage.
    /// </summary>
    [HttpPost("smtp-servers/{id:guid}/test")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> TestSmtp(Guid id, [FromBody] TestSmtpCommand command)
    {
        if (id != command.SmtpServerId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    /// <summary>Lists email templates. Requires associations.manage.</summary>
    [HttpGet("templates")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetTemplates()
    {
        var result = await Mediator.Send(new GetEmailTemplatesQuery());
        return Ok(result);
    }

    /// <summary>Returns a single email template by id. Requires associations.manage.</summary>
    /// <response code="404">Email template not found.</response>
    [HttpGet("templates/{id:guid}")]
    [ProducesResponseType(404)]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetTemplate(Guid id)
    {
        var result = await Mediator.Send(new GetEmailTemplateByIdQuery(id));
        if (result is null) return NotFound(new { error = "Modèle introuvable." });
        return Ok(result);
    }

    /// <summary>Creates an email template. Requires associations.manage.</summary>
    [HttpPost("templates")]
    [ProducesResponseType(201)]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> CreateTemplate([FromBody] CreateEmailTemplateCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    /// <summary>Updates an email template. Requires associations.manage.</summary>
    [HttpPut("templates/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> UpdateTemplate(Guid id, [FromBody] UpdateEmailTemplateCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Deletes an email template. Requires associations.manage.</summary>
    [HttpDelete("templates/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> DeleteTemplate(Guid id)
    {
        var result = await Mediator.Send(new DeleteEmailTemplateCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // ── Outbox (durable email queue) — delivery visibility + requeue ──────────
    /// <summary>Lists outbox emails (filterable by status/search) + overall pending/failed/sent counts. Requires associations.manage.</summary>
    [HttpGet("outbox")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetOutbox([FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var result = await Mediator.Send(new GetOutboxEmailsQuery(status, search, page, pageSize));
        return Ok(result);
    }

    /// <summary>Requeues one outbox email (fresh attempt budget, due now). Requires associations.manage.</summary>
    [HttpPost("outbox/{id:guid}/retry")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> RetryOutbox(Guid id)
    {
        var result = await Mediator.Send(new RetryOutboxEmailCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Requeues every failed outbox email; returns the count. Requires associations.manage.</summary>
    [HttpPost("outbox/retry-failed")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> RetryFailedOutbox()
    {
        var result = await Mediator.Send(new RetryFailedOutboxEmailsCommand());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }

    /// <summary>Discards one outbox email. Requires associations.manage.</summary>
    [HttpDelete("outbox/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> DeleteOutbox(Guid id)
    {
        var result = await Mediator.Send(new DeleteOutboxEmailCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Purges sent outbox rows (housekeeping); optional ?before= keeps newer. Returns the count. Requires associations.manage.</summary>
    [HttpDelete("outbox/sent")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> PurgeSentOutbox([FromQuery] DateTime? before)
    {
        var result = await Mediator.Send(new PurgeSentOutboxEmailsCommand(before));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { count = result.Value });
    }
}
