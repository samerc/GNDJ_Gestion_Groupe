namespace GNDJ.Application.Common.Interfaces;

public interface IEmailService
{
    Task SendAsync(string templateCode, string toEmail, Dictionary<string, string> variables, CancellationToken ct = default);
}
