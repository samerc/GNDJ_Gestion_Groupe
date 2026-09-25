using Microsoft.AspNetCore.OutputCaching;

namespace GNDJ.Api.Middleware;

// Caching for the anonymous PUBLIC site (/api/v1/public/*), which is served from the server's output cache
// ("PublicContent" policy, tag "public", 10 min). Two jobs:
//  1. FRESHNESS — the public pages show data edited all over the admin (news/pages/events/resources, units and
//     their maîtrise names/phones, site texts, settings…). Rather than wiring an eviction into every write
//     endpoint, ANY successful admin write (non-GET, 2xx) clears the "public" tag, so an edit shows up right away.
//     Parent-portal, auth, notification and crash-report writes are excluded (they never change public content and
//     are frequent during enrollment).
//  2. BROWSER CACHE — public GET responses get `Cache-Control: public, max-age=60` so a visitor clicking around the
//     site re-uses pages for a minute instead of refetching (an edit reaches browsers within ~1 min). s-maxage=120
//     caps staleness if a Cloudflare cache rule is ever added for these URLs (the app can't purge Cloudflare).
// Must run BEFORE UseOutputCache so the header is set on cache hits too.
public class PublicCacheMiddleware(RequestDelegate next)
{
    private static readonly string[] NonContentWritePrefixes =
    [
        "/api/v1/applicant", "/api/v1/public", "/api/v1/auth", "/api/v1/errors", "/api/v1/notifications",
    ];

    public async Task InvokeAsync(HttpContext context, IOutputCacheStore cacheStore)
    {
        var path = context.Request.Path.Value ?? "";
        var method = context.Request.Method;

        if ((HttpMethods.IsGet(method) || HttpMethods.IsHead(method))
            && path.StartsWith("/api/v1/public/", StringComparison.OrdinalIgnoreCase)
            && !path.Equals("/api/v1/public/maintenance", StringComparison.OrdinalIgnoreCase)) // polled; must stay live
        {
            context.Response.OnStarting(() =>
            {
                if (context.Response.StatusCode == StatusCodes.Status200OK)
                    context.Response.Headers.CacheControl = "public, max-age=60, s-maxage=120";
                return Task.CompletedTask;
            });
        }

        await next(context);

        if (!HttpMethods.IsGet(method) && !HttpMethods.IsHead(method) && !HttpMethods.IsOptions(method)
            && context.Response.StatusCode is >= 200 and < 300
            && path.StartsWith("/api/v1/", StringComparison.OrdinalIgnoreCase)
            && !NonContentWritePrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            // Best-effort: a failed eviction only means the old page lives until the 10-min expiry.
            try { await cacheStore.EvictByTagAsync("public", context.RequestAborted); } catch { }
        }
    }
}
