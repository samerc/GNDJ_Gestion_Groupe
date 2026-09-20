namespace GNDJ.Domain.Entities;

// A Web Push subscription for ONE member's device/browser (the result of the browser's pushManager.subscribe).
// Created when a member enables notifications; used to deliver push notifications even when the app is closed.
// NOT a BaseEntity — infrastructure plumbing (no soft-delete/audit). `Endpoint` is the unique push-service URL:
// it's per browser+origin, so if a different member enables push in the same browser the SAME endpoint is
// re-owned by them (subscribe upserts by Endpoint). Deleted when the push service reports it's gone (404/410)
// or the member disables notifications.
public class PushSubscription
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid MemberId { get; set; }
    public string Endpoint { get; set; } = string.Empty; // unique push-service URL
    public string P256dh { get; set; } = string.Empty;   // client public key (base64url) for payload encryption
    public string Auth { get; set; } = string.Empty;     // client auth secret (base64url)
    public string? UserAgent { get; set; }               // device/browser label, so the member recognizes it
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }             // refreshed on re-subscribe (same endpoint)
}
