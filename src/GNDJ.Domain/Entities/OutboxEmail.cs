namespace GNDJ.Domain.Entities;

// A durable "email to send" row — the persistent outbox that replaces the old in-memory email queue.
// An email intent is written here (ideally in/after the same transaction as the state change that triggers
// it), so that once the trigger is committed the email survives a process restart / crash / deploy and is
// eventually sent at-least-once by the background sender. Deliberately NOT a BaseEntity: it's infrastructure
// plumbing, so it skips the audit + soft-delete interceptors and the global query filter. CreatedAt is set
// explicitly on insert.
public class OutboxEmail
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    // The seeded email template code (e.g. "member_password_reset") + recipient + the {{variable}} values,
    // serialized as a JSON object of string→string. Mirrors the old EmailJob record so send logic is unchanged.
    public string TemplateCode { get; set; } = string.Empty;
    public string ToEmail { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = "{}";

    // Pending  = not yet sent (the sender claims + sends these).
    // Sent     = delivered to SMTP successfully (terminal).
    // Failed   = gave up after MaxAttempts (terminal; LastError explains why — a human/admin can inspect).
    public OutboxEmailStatus Status { get; set; } = OutboxEmailStatus.Pending;

    public int Attempts { get; set; }             // how many send attempts have been made
    public string? LastError { get; set; }        // last failure reason (truncated), for diagnostics

    public DateTime CreatedAt { get; set; }       // when the intent was recorded
    // Earliest time the sender may (re)claim this row. Set to a short time in the FUTURE when a worker picks
    // a row up (a lease) so a crashed mid-send doesn't double-send and a failed send is retried after backoff.
    public DateTime NextAttemptAt { get; set; }
    public DateTime? SentAt { get; set; }         // when it was successfully sent (null until Sent)

    // The SMTP server this row was (or will be) sent through, stamped by the sender when it resolves the route.
    // Lets the rate-limiter measure a provider's recent send count PER server from the durable table (so the
    // cap survives restarts) and lets the admin outbox view show which provider carried each mail. Nullable:
    // legacy rows and rows never yet attempted have no server. No FK — a deleted server just leaves a dangling id.
    public Guid? SmtpServerId { get; set; }
}

public enum OutboxEmailStatus
{
    Pending = 0,
    Sent = 1,
    Failed = 2,
}
