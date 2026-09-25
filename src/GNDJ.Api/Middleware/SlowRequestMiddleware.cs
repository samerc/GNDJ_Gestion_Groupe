using System.Diagnostics;
using System.Text.RegularExpressions;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Api.Middleware;

// Times every /api request; a request slower than the threshold (Monitoring:SlowRequestMs, default 2000 ms) is
// recorded in ISlowRequestLog (Système page) and logged as a Warning (so it also lands in application_logs).
// Placed after authentication so the caller's role is known. The route is normalised: GUIDs and numeric ids become
// {id}, and the query string is dropped, so every call to the same screen counts together.
public partial class SlowRequestMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ISlowRequestLog _log;
    private readonly ILogger<SlowRequestMiddleware> _logger;

    public SlowRequestMiddleware(RequestDelegate next, ISlowRequestLog log, ILogger<SlowRequestMiddleware> logger)
    {
        _next = next;
        _log = log;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";
        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)) { await _next(context); return; }

        var sw = Stopwatch.StartNew();
        try { await _next(context); }
        finally
        {
            sw.Stop();
            if (sw.ElapsedMilliseconds >= _log.ThresholdMs && !context.RequestAborted.IsCancellationRequested)
            {
                var route = Normalise(path);
                var role = RoleOf(context);
                _log.Record(context.Request.Method, route, context.Response.StatusCode, sw.ElapsedMilliseconds, role);
                _logger.LogWarning("Slow request {Method} {Route} took {ElapsedMs} ms (status {Status}, role {Role})",
                    context.Request.Method, route, sw.ElapsedMilliseconds, context.Response.StatusCode, role);
            }
        }
    }

    public static string Normalise(string path)
    {
        var p = GuidRegex().Replace(path, "{id}");
        p = NumberSegmentRegex().Replace(p, "/{id}");
        return p.Length > 200 ? p[..200] : p;
    }

    // Coarse role, enough to tell "slow for the CG" from "slow for everyone".
    private static string RoleOf(HttpContext ctx)
    {
        var u = ctx.User;
        if (u.Identity?.IsAuthenticated != true) return "anonyme";
        if (u.FindFirst("applicant_id") is not null) return "parent (portail)";
        if (u.FindFirst("is_super_admin")?.Value == "true") return "super-admin";
        var perms = (u.FindFirst("permissions")?.Value ?? "").Split(',');
        if (perms.Contains("maitrise.manage")) return "chef de groupe";
        if (perms.Contains("members.edit")) return "chef d'unité";
        return "membre";
    }

    [GeneratedRegex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")]
    private static partial Regex GuidRegex();

    [GeneratedRegex(@"/\d+(?=/|$)")]
    private static partial Regex NumberSegmentRegex();
}
