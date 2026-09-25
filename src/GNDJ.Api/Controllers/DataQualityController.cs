using GNDJ.Api.Authorization;
using GNDJ.Application.DataQuality;
using GNDJ.Application.Email;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>"Qualité des données" (Chef de Groupe): member data that needs fixing, and email bounces.</summary>
[Authorize]
[Route("api/v1/data-quality")]
public class DataQualityController : BaseApiController
{
    /// <summary>The report: invalid / bounced emails, members without email, missing date of birth / gender, duplicates.</summary>
    [HttpGet]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> Get()
    {
        var result = await Mediator.Send(new GetDataQualityReportQuery());
        return Ok(result.Value);
    }

    /// <summary>Forget an email bounce (the address was fixed): mail is sent to it again.</summary>
    [HttpDelete("bounces/{id:guid}")]
    [HasPermission(Permissions.MaitriseManage)]
    public async Task<IActionResult> ClearBounce(Guid id)
    {
        var result = await Mediator.Send(new ClearEmailBounceCommand(id));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }
}
