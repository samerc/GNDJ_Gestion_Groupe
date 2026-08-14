namespace GNDJ.Application.Common.Interfaces;

// Sends an email synchronously by loading the named DB template + its SMTP server, substituting
// {{variables}}, and dispatching. For non-blocking bulk sends use IEmailQueue instead.
public interface IEmailService
{
    Task SendAsync(string templateCode, string toEmail, Dictionary<string, string> variables, CancellationToken ct = default);

    // Resolves WHICH SMTP server a given template routes to (the template's own, else the oldest active) and
    // that server's optional per-hour cap — WITHOUT sending. The outbox sender calls this to stamp the row's
    // server id and apply rate-limiting before dispatch. Returns null if no template/server can be resolved
    // (the actual send will then fail and be recorded); resolution is cached exactly like SendAsync's.
    Task<EmailRoute?> ResolveRouteAsync(string templateCode, CancellationToken ct = default);
}

// The delivery route for a template: the resolved SMTP server + its optional emails/hour cap (null = unlimited).
public sealed record EmailRoute(Guid ServerId, int? MaxPerHour);
