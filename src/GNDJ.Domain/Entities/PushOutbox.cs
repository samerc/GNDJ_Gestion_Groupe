namespace GNDJ.Domain.Entities;

// A durable "push notification to send" row — the persistent outbox for Web Push (mirrors OutboxEmail). One row
// = one push to one member, fanned out to ALL that member's device subscriptions by the background sender.
// Written right after the in-app Notification row is committed, so a push survives a restart/crash/deploy and is
// delivered at-least-once. NOT a BaseEntity (infrastructure plumbing; CreatedAt set explicitly).
public class PushOutbox
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid MemberId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? Url { get; set; }   // relative app path a tap should open (e.g. "/my-documents")
    public string? Type { get; set; }  // notification type (drives icon/grouping on the client)

    // Pending = not yet sent; Sent = delivered to ≥1 device OR the member has no subscriptions (terminal);
    // Failed = gave up after MaxAttempts (LastError explains why).
    public PushOutboxStatus Status { get; set; } = PushOutboxStatus.Pending;
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime NextAttemptAt { get; set; } // earliest (re)claim time; leased into the future while sending
    public DateTime? SentAt { get; set; }
}

public enum PushOutboxStatus
{
    Pending = 0,
    Sent = 1,
    Failed = 2,
}
