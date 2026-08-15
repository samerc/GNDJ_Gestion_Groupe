namespace GNDJ.Application.Common;

// Helpers for turning an exception into a useful diagnostic string. System.Net.Mail in particular wraps the
// real cause: an SmtpException's own Message is the generic "Failure sending mail." while the actual reason
// (auth rejected, TLS handshake failed, "550 domain not allowed", connection refused…) sits in InnerException.
// Flatten walks the whole InnerException chain so the SMTP test dialog and the email outbox show the real error.
public static class ExceptionExtensions
{
    public static string Flatten(this Exception ex)
    {
        var messages = new List<string>();
        var seen = new HashSet<string>();
        for (Exception? e = ex; e is not null; e = e.InnerException)
        {
            var msg = e.Message?.Trim();
            if (!string.IsNullOrEmpty(msg) && seen.Add(msg)) // skip blanks + repeated identical messages
                messages.Add(msg);
        }
        return messages.Count > 0 ? string.Join(" → ", messages) : ex.GetType().Name;
    }
}
