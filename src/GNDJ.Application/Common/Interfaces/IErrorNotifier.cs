namespace GNDJ.Application.Common.Interfaces;

// A single server or client error worth alerting the super-admin about.
// ErrorId is the short reference also shown to the user (so a report can be tied to the email + logs).
// Source = "server" (unhandled API exception) or "client" (a React crash / unhandled browser error).
public record ErrorReport(
    string ErrorId,
    string Source,
    string Message,
    string? Detail,
    string? Method,
    string? Path,
    string? User);

// Best-effort admin alerting for errors. Implementations MUST never throw (a failure to notify must not
// mask the original error) and SHOULD throttle/dedupe so one incident doesn't flood the inbox.
public interface IErrorNotifier
{
    Task NotifyAsync(ErrorReport report, CancellationToken ct = default);
}
