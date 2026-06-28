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
}
