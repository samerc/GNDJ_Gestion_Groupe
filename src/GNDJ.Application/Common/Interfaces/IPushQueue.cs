namespace GNDJ.Application.Common.Interfaces;

// A single push-notification intent for one member (fanned out to all their devices by the sender).
public record PushJob(Guid MemberId, string Type, string Title, string? Body, string? Url);

// Durable Web Push queue (mirrors IEmailQueue): enqueuing WRITES a push_outbox row that the background sender
// drains, so a push survives a restart and is delivered at-least-once. Best-effort — never throws into the
// caller (a lost push must not roll back the triggering action; the in-app notification row still exists).
public interface IPushQueue
{
    Task EnqueueAsync(PushJob job, CancellationToken ct = default);
    Task EnqueueManyAsync(IEnumerable<PushJob> jobs, CancellationToken ct = default);
}
