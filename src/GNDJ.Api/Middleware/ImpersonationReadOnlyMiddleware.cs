using System.Text.Json;

namespace GNDJ.Api.Middleware;

// Enforces that a "Voir comme" (impersonation) session is strictly READ-ONLY. A request carrying an
// impersonation token (claim impersonation=true, minted by TokenService.GenerateImpersonationToken) may only
// perform safe methods; any POST/PUT/PATCH/DELETE is refused with 403. This is the real guarantee behind the
// feature — even though the impersonating admin sees the member's edit affordances, nothing can mutate, so
// there's no accidental damage and no action falsely attributed to the member. It also makes NESTED
// impersonation impossible (POST /auth/impersonate from an impersonation session is itself a blocked mutation).
// Runs after authentication so the token's claims are available.
public class ImpersonationReadOnlyMiddleware
{
    private readonly RequestDelegate _next;

    public ImpersonationReadOnlyMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User?.FindFirst("impersonation")?.Value == "true")
        {
            var method = context.Request.Method;
            var isMutation = HttpMethods.IsPost(method) || HttpMethods.IsPut(method)
                || HttpMethods.IsPatch(method) || HttpMethods.IsDelete(method);
            if (isMutation)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";
                // impersonationReadOnly flag lets the SPA surface a friendly toast instead of a generic error.
                await context.Response.WriteAsync(JsonSerializer.Serialize(new
                {
                    error = "Mode « Voir comme » : lecture seule. Quittez ce mode pour effectuer des modifications.",
                    impersonationReadOnly = true
                }));
                return;
            }
        }

        await _next(context);
    }
}
