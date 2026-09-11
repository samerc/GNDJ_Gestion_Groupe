namespace GNDJ.Domain.Entities;

// An in-app notification for one recipient member (the app's own alerting, independent of email delivery).
// Deliberately NOT a BaseEntity: it's lightweight plumbing (no audit/soft-delete). The Title/Body/LinkUrl are
// DENORMALIZED — baked at creation time — so rendering never depends on the referenced entity still existing,
// and the recipient's list is a trivial read. CreatedAt is a real instant (UTC), used for "time ago" ordering.
public class Notification
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    // The recipient. Every acting user is a Member (a login is 1:1 with a member), so keying on MemberId lets
    // both member-facing and manager-facing notifications share one shape, and "my notifications" is simply
    // MemberId == the current user's MemberId.
    public Guid MemberId { get; set; }

    public string Type { get; set; } = "info"; // coarse category (document / change_request / demande / hold / info) — drives the icon/colour
    public string Title { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? LinkUrl { get; set; } // relative app route to open on click (e.g. "/my-documents")

    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }
}
