namespace GNDJ.Application.Common.Interfaces;

// One email to send: the template code, the recipient, and the {{variable}} substitutions.
public record EmailJob(string TemplateCode, string ToEmail, Dictionary<string, string> Variables);

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
}
