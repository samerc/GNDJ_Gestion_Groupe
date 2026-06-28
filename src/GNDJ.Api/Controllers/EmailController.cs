using GNDJ.Api.Authorization;
using GNDJ.Application.Email;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Email infrastructure admin: SMTP servers + email templates.
// Route: api/v1/email. [Authorize] = JWT/API-key. Whole controller gated on AssociationsManage.
[Authorize]
[Route("api/v1/email")]
public class EmailController : BaseApiController
{
    // SMTP Servers
    [HttpGet("smtp-servers")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetSmtpServers()
    {
        var result = await Mediator.Send(new GetSmtpServersQuery());
        return Ok(result);
    }

    [HttpPost("smtp-servers")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> CreateSmtpServer([FromBody] CreateSmtpServerCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpPut("smtp-servers/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> UpdateSmtpServer(Guid id, [FromBody] UpdateSmtpServerCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("smtp-servers/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> DeleteSmtpServer(Guid id)
    {
        var result = await Mediator.Send(new DeleteSmtpServerCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    // Sends a live test email through the stored SMTP config to verify credentials/connectivity.
    [HttpPost("smtp-servers/{id:guid}/test")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> TestSmtp(Guid id, [FromBody] TestSmtpCommand command)
    {
        if (id != command.SmtpServerId) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(new { success = true });
    }

    // Email Templates
    [HttpGet("templates")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetTemplates()
    {
        var result = await Mediator.Send(new GetEmailTemplatesQuery());
        return Ok(result);
    }

    [HttpGet("templates/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> GetTemplate(Guid id)
    {
        var result = await Mediator.Send(new GetEmailTemplateByIdQuery(id));
        if (result is null) return NotFound(new { error = "Modèle introuvable." });
        return Ok(result);
    }

    [HttpPost("templates")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> CreateTemplate([FromBody] CreateEmailTemplateCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Created("", new { id = result.Value });
    }

    [HttpPut("templates/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> UpdateTemplate(Guid id, [FromBody] UpdateEmailTemplateCommand command)
    {
        if (id != command.Id) return BadRequest(new { error = "L'identifiant ne correspond pas." });
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    [HttpDelete("templates/{id:guid}")]
    [HasPermission(Permissions.AssociationsManage)]
    public async Task<IActionResult> DeleteTemplate(Guid id)
    {
        var result = await Mediator.Send(new DeleteEmailTemplateCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
