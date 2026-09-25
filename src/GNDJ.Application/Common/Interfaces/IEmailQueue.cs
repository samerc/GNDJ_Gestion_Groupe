namespace GNDJ.Application.Common.Interfaces;

// A PER-SEND email attachment: a file to attach to THIS email only (distinct from a template's fixed
// attachments). Path is an ABSOLUTE file path under an allowed, NON-web-served archive root (e.g. the
// audit-log year archive) — the sender validates it before attaching. Name is the display file name.
public record EmailAttachment(string Name, string Path);

// One email to send: the template code, the recipient, the {{variable}} substitutions, and optional
// per-send file attachments (usually none; used e.g. by the audit-log year archive to attach the CSV).
public record EmailJob(string TemplateCode, string ToEmail, Dictionary<string, string> Variables,
    IReadOnlyList<EmailAttachment>? Attachments = null);

// Durable email outbox. Enqueuing PERSISTS the email as a row (email_outbox) and returns quickly; a
// background sender delivers it, so HTTP requests never block on SMTP and a queued email survives a process
// restart / crash / deploy (at-least-once). Call AFTER (or in) the transaction that commits the triggering
// state change — the email is recorded only if you reach the enqueue, and it can then only be lost by a crash
// in the brief window before the outbox row itself commits (its own transaction here).
public interface IEmailQueue
{
    // Record one email. Awaits the durable write.
    Task EnqueueAsync(EmailJob job, CancellationToken ct = default);

    // Record several emails in a single write (one round-trip) — for batch sends (demande responses,
    // "Envoyer les accès", multi-recipient reset links). No-op on an empty set.
    Task EnqueueManyAsync(IEnumerable<EmailJob> jobs, CancellationToken ct = default);

    // ATOMIC variant: add the outbox rows to the CALLER's context WITHOUT saving, so they commit in the SAME
    // SaveChanges as the caller's own state change (e.g. a campaign step's "done" marker) — both happen or
    // neither does, so a crash can't leave "emails queued but step not marked" (→ sent twice on the re-run).
    // Call Wake() after that SaveChanges succeeds so the sender goes now instead of at its next poll.
    void Stage(IApplicationDbContext context, IEnumerable<EmailJob> jobs);
    void Wake();
}
