namespace GNDJ.Application.Common.Interfaces;

// Sends an email synchronously by loading the named DB template + its SMTP server, substituting
// {{variables}}, and dispatching. For non-blocking bulk sends use IEmailQueue instead.
public interface IEmailService
{
    Task SendAsync(string templateCode, string toEmail, Dictionary<string, string> variables, CancellationToken ct = default);
}
