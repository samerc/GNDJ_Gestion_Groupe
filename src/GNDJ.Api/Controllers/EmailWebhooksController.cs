using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GNDJ.Application.Email;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Bounce / spam-complaint notifications pushed by the email providers, so an address that can't receive mail is
/// flagged (Qualité des données) and no longer sent to. Anonymous (called by the providers), each call authenticated:
/// Mailgun by its HMAC signature (config EmailBounces:MailgunSigningKey); SMTP2GO / SendPulse / others by a secret
/// token in the URL (config EmailBounces:WebhookToken). Always answers quickly; 401 when authentication fails.
/// </summary>
[AllowAnonymous]
[Route("api/v1/email/webhooks")]
public class EmailWebhooksController(IConfiguration config, ILogger<EmailWebhooksController> logger) : BaseApiController
{
    /// <summary>Mailgun webhook ("Permanent failure", "Temporary failure", "Spam complaints"). Signed by Mailgun.</summary>
    [HttpPost("mailgun")]
    public async Task<IActionResult> Mailgun([FromBody] JsonElement body)
    {
        var key = config["EmailBounces:MailgunSigningKey"];
        if (string.IsNullOrWhiteSpace(key) || !body.TryGetProperty("signature", out var sig)) return Unauthorized();
        var timestamp = Str(sig, "timestamp");
        var token = Str(sig, "token");
        var signature = Str(sig, "signature");
        if (timestamp is null || token is null || signature is null) return Unauthorized();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
        var expected = Convert.ToHexStringLower(hmac.ComputeHash(Encoding.UTF8.GetBytes(timestamp + token)));
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(signature.ToLowerInvariant())))
            return Unauthorized();
        // Replay guard: Mailgun's timestamp must be recent.
        if (long.TryParse(timestamp, out var ts) && Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - ts) > 3600) return Unauthorized();

        if (!body.TryGetProperty("event-data", out var ev)) return Ok();
        var evt = Str(ev, "event")?.ToLowerInvariant();
        var recipient = Str(ev, "recipient");
        string? kind = evt switch
        {
            "failed" => Str(ev, "severity")?.ToLowerInvariant() == "temporary" ? EmailBounceKinds.Soft : EmailBounceKinds.Hard,
            "complained" => EmailBounceKinds.Complaint,
            _ => null,
        };
        if (kind is null || recipient is null) return Ok();
        string? reason = null;
        if (ev.TryGetProperty("delivery-status", out var ds))
            reason = Str(ds, "description") is { Length: > 0 } d ? d : Str(ds, "message");
        await Mediator.Send(new RecordEmailBounceCommand("mailgun", recipient, kind, reason));
        return Ok();
    }

    /// <summary>Generic webhook (SMTP2GO, SendPulse…): POST /email/webhooks/{provider}/{token}. JSON object, JSON array
    /// or form fields; bounce / spam events are recorded, everything else is ignored.</summary>
    [HttpPost("{provider}/{token}")]
    public async Task<IActionResult> Generic(string provider, string token)
    {
        var expected = config["EmailBounces:WebhookToken"];
        if (string.IsNullOrWhiteSpace(expected)
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(token)))
            return Unauthorized();
        provider = new string(provider.ToLowerInvariant().Where(char.IsLetterOrDigit).Take(30).ToArray());

        var events = new List<Dictionary<string, string>>();
        if (Request.HasFormContentType)
        {
            var form = await Request.ReadFormAsync();
            events.Add(form.ToDictionary(k => k.Key.ToLowerInvariant(), v => v.Value.ToString()));
        }
        else
        {
            try
            {
                using var doc = await JsonDocument.ParseAsync(Request.Body);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    foreach (var e in doc.RootElement.EnumerateArray()) events.Add(Flatten(e));
                else if (doc.RootElement.ValueKind == JsonValueKind.Object)
                    events.Add(Flatten(doc.RootElement));
            }
            catch (JsonException) { return Ok(); } // unreadable → ignore (never make the provider retry forever)
        }

        foreach (var e in events)
        {
            var evt = (Get(e, "event", "type", "event_type") ?? "").ToLowerInvariant();
            var recipient = Get(e, "rcpt", "recipient", "email", "to");
            if (recipient is null) continue;
            string? kind =
                evt.Contains("spam") || evt.Contains("complain") ? EmailBounceKinds.Complaint
                : evt.Contains("bounce") || evt.Contains("reject") || evt.Contains("fail")
                    ? (evt.Contains("soft") || (Get(e, "bounce", "bounce_type") ?? "").ToLowerInvariant().Contains("soft")
                        ? EmailBounceKinds.Soft : EmailBounceKinds.Hard)
                : null;
            if (kind is null) continue;
            await Mediator.Send(new RecordEmailBounceCommand(provider, recipient, kind,
                Get(e, "reason", "message", "description", "smtp_response", "bounce_text")));
        }
        logger.LogInformation("Email webhook {Provider}: {Count} event(s)", provider, events.Count);
        return Ok();
    }

    private static string? Str(JsonElement e, string name)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v)
            ? v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString()
            : null;

    // Top-level properties of one event (nested objects kept as raw JSON text), keys lowercased.
    private static Dictionary<string, string> Flatten(JsonElement e)
    {
        var d = new Dictionary<string, string>();
        if (e.ValueKind != JsonValueKind.Object) return d;
        foreach (var p in e.EnumerateObject())
            d[p.Name.ToLowerInvariant()] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? "" : p.Value.ToString();
        return d;
    }

    private static string? Get(Dictionary<string, string> d, params string[] keys)
    {
        foreach (var k in keys)
            if (d.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v)) return v.Trim();
        return null;
    }
}
