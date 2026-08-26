using System.Text.Json;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Api.Middleware;

// Enforces the maintenance/kill-switches server-side: when a module (or the whole site) is in maintenance,
// API calls to it return 503 with the maintenance message, so a broken module actually stops serving. Only
// gates /api/* (the SPA HTML always loads so the frontend can render the "Sous maintenance" page). Runs AFTER
// authentication so the super-admin claim is available.
//
// ALWAYS allowed (so an admin can recover): the super-admin (they toggle it back off), the member auth
// endpoints (login/refresh/me — needed to sign in), the maintenance-status endpoint, health, and client
// crash reporting. Module = by path: /public → public, /applicant → demande, everything else → membres.
public class MaintenanceMiddleware
{
    private readonly RequestDelegate _next;

    public MaintenanceMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IMaintenanceProvider provider)
    {
        var path = context.Request.Path.Value ?? "";

        // Only gate API calls; let the SPA + static assets through so the maintenance page can render.
        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        if (IsAlwaysAllowed(path) || context.User?.FindFirst("is_super_admin")?.Value == "true")
        {
            await _next(context);
            return;
        }

        var state = await provider.GetAsync(context.RequestAborted);
        if (!state.Site && !state.PublicSite && !state.Demande && !state.Membres)
        {
            await _next(context);
            return;
        }

        var module = MapModule(path);
        var down = state.Site
            || (module == "public" && state.PublicSite)
            || (module == "demande" && state.Demande)
            || (module == "membres" && state.Membres);

        if (!down)
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        context.Response.ContentType = "application/json";
        context.Response.Headers.RetryAfter = "3600";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { maintenance = true, message = state.Message }));
    }

    private static bool IsAlwaysAllowed(string path) =>
        path.StartsWith("/api/v1/auth/", StringComparison.OrdinalIgnoreCase)         // member login/refresh/me/bootstrap
        || path.StartsWith("/api/v1/public/maintenance", StringComparison.OrdinalIgnoreCase) // status probe
        || path.StartsWith("/api/v1/errors/report", StringComparison.OrdinalIgnoreCase);      // crash reporting

    private static string MapModule(string path)
    {
        if (path.StartsWith("/api/v1/public/", StringComparison.OrdinalIgnoreCase)) return "public";
        if (path.StartsWith("/api/v1/applicant", StringComparison.OrdinalIgnoreCase)) return "demande";
        return "membres";
    }
}
