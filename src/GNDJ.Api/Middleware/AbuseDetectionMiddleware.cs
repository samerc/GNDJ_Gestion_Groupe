using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace GNDJ.Api.Middleware;

// Defense-in-depth abuse detection for JSON write requests:
//  (2) rejects payloads carrying high-confidence attack signatures (script/XSS, SQL-injection
//      meta-patterns, absurdly long unbroken tokens) and LOGS the attempt to Serilog;
//  (3) honeypot — rejects any payload with a non-empty "website" field. No real form has that
//      field; it is rendered hidden from humans and only a bot would fill it.
// The DB layer is fully parameterised (EF/LINQ) and React auto-escapes output, so this is an extra
// logging/rejection layer, not the primary control. Patterns are deliberately conservative
// (multi-token signatures only — never bare keywords like "select") to avoid false positives on
// legitimate French free text.
public partial class AbuseDetectionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<AbuseDetectionMiddleware> _logger;

    public AbuseDetectionMiddleware(RequestDelegate next, ILogger<AbuseDetectionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    // Script / event-handler / XSS injection.
    [GeneratedRegex(@"<\s*script|<\s*/\s*script|<\s*iframe|<\s*svg|javascript\s*:|on(error|load|click|mouseover|focus|toggle)\s*=",
        RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 200)]
    private static partial Regex ScriptPattern();

    // SQL-injection meta-patterns. High-confidence multi-token signatures only — a bare "select"
    // or "union" is NOT matched because those appear in ordinary text.
    [GeneratedRegex(@"union\s+select|drop\s+table|truncate\s+table|'\s*or\s+'?1'?\s*=\s*'?1|""\s*or\s+""?1""?\s*=|'\s*;?\s*--|/\*.*?\*/|xp_cmdshell|waitfor\s+delay|pg_sleep\s*\(|;\s*shutdown",
        RegexOptions.IgnoreCase, matchTimeoutMilliseconds: 200)]
    private static partial Regex SqlPattern();

    // Admin email-template authoring legitimately carries rich HTML markup — skip the script/SQL
    // content scan for that path (honeypot + length checks still apply).
    private static bool IsRichContentPath(PathString path) =>
        path.StartsWithSegments("/api/v1/email/templates", StringComparison.OrdinalIgnoreCase);

    public async Task InvokeAsync(HttpContext context)
    {
        if (ShouldInspect(context.Request))
        {
            context.Request.EnableBuffering();
            string body;
            using (var reader = new StreamReader(context.Request.Body, Encoding.UTF8,
                detectEncodingFromByteOrderMarks: false, leaveOpen: true))
            {
                body = await reader.ReadToEndAsync();
            }
            context.Request.Body.Position = 0; // rewind so model binding can read it again

            if (!string.IsNullOrEmpty(body))
            {
                // (3) Honeypot
                if (HasFilledHoneypot(body))
                {
                    await RejectAsync(context, "honeypot", "Requête rejetée.");
                    return;
                }

                // (2) Attack signatures (skip script/SQL scan for admin rich-content endpoints)
                if (!IsRichContentPath(context.Request.Path))
                {
                    string? matched =
                        ScriptPattern().IsMatch(body) ? "script/xss" :
                        SqlPattern().IsMatch(body) ? "sql-injection" :
                        HasExtremelyLongToken(body) ? "oversized-token" : null;

                    if (matched is not null)
                    {
                        await RejectAsync(context, matched, "Requête rejetée : contenu non autorisé.");
                        return;
                    }
                }
            }
        }

        await _next(context);
    }

    private static bool ShouldInspect(HttpRequest req)
    {
        if (!HttpMethods.IsPost(req.Method) && !HttpMethods.IsPut(req.Method) && !HttpMethods.IsPatch(req.Method))
            return false;
        var ct = req.ContentType;
        return ct is not null && ct.Contains("application/json", StringComparison.OrdinalIgnoreCase);
    }

    // Honeypot field name = "website". Reject only when present AND non-empty.
    private static bool HasFilledHoneypot(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("website", out var hp) &&
                hp.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(hp.GetString()))
                return true;
        }
        catch (JsonException) { /* not a JSON object — let model binding handle the error */ }
        return false;
    }

    // Any run of >10,000 non-whitespace characters is not legitimate free text (which has spaces).
    // Body size is already capped at 1MB globally; this catches a single abusive field value.
    private static bool HasExtremelyLongToken(string body)
    {
        int run = 0;
        foreach (var c in body)
        {
            if (char.IsWhiteSpace(c)) { run = 0; continue; }
            if (++run > 10_000) return true;
        }
        return false;
    }

    private async Task RejectAsync(HttpContext context, string reason, string message)
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var user = context.User.FindFirst("sub")?.Value
            ?? context.User.FindFirst("applicant_id")?.Value;
        _logger.LogWarning(
            "Abuse pattern blocked: {Reason} on {Method} {Path} from IP {IP} user {User}",
            reason, context.Request.Method, context.Request.Path, ip, user ?? "anonymous");

        context.Response.StatusCode = 400;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            type = "https://tools.ietf.org/html/rfc7231#section-6.5.1",
            title = "Erreur de validation",
            status = 400,
            errors = new Dictionary<string, string[]> { ["requete"] = new[] { message } }
        }));
    }
}
