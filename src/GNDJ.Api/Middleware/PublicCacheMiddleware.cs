using Microsoft.AspNetCore.OutputCaching;

namespace GNDJ.Api.Middleware;

// Caching for the anonymous PUBLIC site (/api/v1/public/*), which is served from the server's output cache
// ("PublicContent" policy, tag "public", 10 min). Two jobs:
//  1. FRESHNESS — the public pages show data edited all over the admin (news/pages/events/resources, units and
//     their maîtrise names/phones, site texts, settings…). Rather than wiring an eviction into every write
//     endpoint, ANY successful admin write (non-GET, 2xx) clears the "public" tag, so an edit shows up right away.
//     Writes that never change public content are excluded, especially the FREQUENT ones (parent portal, auth,
//     notifications, a member's own profile / documents / PWA ping, attendance, camp scoring, cotisations, passage
//     proposals, demande triage…): otherwise the public cache was emptied every few seconds in busy periods and
//     every public visit hit the database. The few actions inside those areas that DO change the public site
//     (publishing the passage, sending the demande responses, closing / opening the inscriptions) still evict.
//  2. BROWSER CACHE — public GET responses get `Cache-Control: public, max-age=60` so a visitor clicking around the
//     site re-uses pages for a minute instead of refetching (an edit reaches browsers within ~1 min). s-maxage=120
//     caps staleness if a Cloudflare cache rule is ever added for these URLs (the app can't purge Cloudflare).
// Must run BEFORE UseOutputCache so the header is set on cache hits too.
public class PublicCacheMiddleware(RequestDelegate next)
{
    private static readonly string[] NonContentWritePrefixes =
    [
        "/api/v1/applicant", "/api/v1/public", "/api/v1/auth", "/api/v1/errors", "/api/v1/notifications",
        "/api/v1/my-profile", "/api/v1/documents", "/api/v1/scan-upload", "/api/v1/meetings", "/api/v1/camps",
        "/api/v1/cotisations", "/api/v1/change-requests", "/api/v1/rentree", "/api/v1/passages", "/api/v1/demandes",
        "/api/v1/contact-messages", "/api/v1/email", "/api/v1/sessions", "/api/v1/logs", "/api/v1/audit-logs",
    ];

    // Inside an excluded area, these writes DO change what the public site shows (unit rosters / team counts, the
    // « inscriptions ouvertes » state), so they still clear the cache.
    private static readonly string[] PublicAffectingWrites =
    [
        "/api/v1/passages/finalize", "/api/v1/demandes/send-responses", "/api/v1/demandes/close-campaign",
        "/api/v1/demandes/submissions",
    ];

    private static bool AffectsPublicSite(string path) =>
        PublicAffectingWrites.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase))
        // A rentrée « do » action (open the inscriptions / the passage) changes the public « inscriptions » state.
        || path.EndsWith("/run-action", StringComparison.OrdinalIgnoreCase)
        || !NonContentWritePrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

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
            && AffectsPublicSite(path))
        {
            // Best-effort: a failed eviction only means the old page lives until the 10-min expiry.
            try { await cacheStore.EvictByTagAsync("public", context.RequestAborted); } catch { }
        }
    }
}
