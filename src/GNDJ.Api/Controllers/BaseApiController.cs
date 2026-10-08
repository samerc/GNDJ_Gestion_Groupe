using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Base for all API controllers: fixes the route convention (api/v1/{controller}) and
// lazily resolves the Mediator (ISender) so derived controllers just dispatch commands/queries.
[ApiController]
[Route("api/v1/[controller]")]
public abstract class BaseApiController : ControllerBase
{
    private ISender? _mediator;
    // Resolved per-request from the DI container on first access, then cached for the request.
    protected ISender Mediator => _mediator ??= HttpContext.RequestServices.GetRequiredService<ISender>();

    // Shared Result → HTTP mapping (was repeated in almost every action): success → 200 with the value / 204 /
    // 200 { id }, failure → 400 { error } (the French message the frontend shows).
    protected IActionResult OkOrBadRequest<T>(Result<T> result)
        => result.IsSuccess ? Ok(result.Value) : BadRequest(new { error = result.Error });

    protected IActionResult NoContentOrBadRequest<T>(Result<T> result)
        => result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });

    protected IActionResult OkIdOrBadRequest<T>(Result<T> result)
        => result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });
}
