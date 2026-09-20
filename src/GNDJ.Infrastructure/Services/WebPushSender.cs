using GNDJ.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using WebPush;
using DomainPushSubscription = GNDJ.Domain.Entities.PushSubscription;
using LibPushSubscription = WebPush.PushSubscription;

namespace GNDJ.Infrastructure.Services;

// Outcome of a single push send: Sent = delivered to the push service; Gone = the subscription is dead
// (404/410 → delete it); Error = a transient/other failure (retry later).
public enum PushSendResult { Sent, Gone, Error }

// Sends an encrypted Web Push message to ONE device subscription using our VAPID keys. Wraps the WebPush
// library. Singleton (holds an HttpClient). VAPID config: WebPush:PublicKey / :PrivateKey / :Subject
// (a mailto: or https: contact URL required by the spec). If VAPID isn't configured, IsConfigured is false
// and the sender is a no-op (Error) — nothing is sent until keys are set.
public interface IWebPushSender
{
    bool IsConfigured { get; }
    string? PublicKey { get; }
    Task<PushSendResult> SendAsync(DomainPushSubscription sub, string payloadJson, CancellationToken ct);
}

public class WebPushSender : IWebPushSender
{
    private readonly WebPushClient _client = new();
    private readonly VapidDetails? _vapid;
    private readonly ILogger<WebPushSender> _logger;

    public WebPushSender(IConfiguration config, ILogger<WebPushSender> logger)
    {
        _logger = logger;
        var publicKey = config["WebPush:PublicKey"];
        var privateKey = config["WebPush:PrivateKey"];
        // The VAPID "subject" identifies us to the push service; default to a mailto if not set explicitly.
        var subject = config["WebPush:Subject"];
        if (string.IsNullOrWhiteSpace(subject)) subject = "mailto:contact@gndj.org";
        PublicKey = publicKey;
        if (!string.IsNullOrWhiteSpace(publicKey) && !string.IsNullOrWhiteSpace(privateKey))
        {
            try { _vapid = new VapidDetails(subject, publicKey, privateKey); }
            catch (Exception ex) { _logger.LogError(ex, "Invalid VAPID keys — Web Push disabled"); }
        }
    }

    public bool IsConfigured => _vapid is not null;
    public string? PublicKey { get; }

    public async Task<PushSendResult> SendAsync(DomainPushSubscription sub, string payloadJson, CancellationToken ct)
    {
        if (_vapid is null) return PushSendResult.Error; // not configured
        try
        {
            var pushSub = new LibPushSubscription(sub.Endpoint, sub.P256dh, sub.Auth);
            // The WebPush library's SendNotificationAsync has no cancellation-token overload.
            ct.ThrowIfCancellationRequested();
            await _client.SendNotificationAsync(pushSub, payloadJson, _vapid);
            return PushSendResult.Sent;
        }
        catch (WebPushException ex)
        {
            // 404 (Not Found) / 410 (Gone) = the subscription no longer exists → caller deletes it.
            var code = (int)ex.StatusCode;
            if (code == 404 || code == 410) return PushSendResult.Gone;
            _logger.LogWarning(ex, "Web Push send failed with status {Status}", code);
            return PushSendResult.Error;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Web Push send failed");
            return PushSendResult.Error;
        }
    }
}
