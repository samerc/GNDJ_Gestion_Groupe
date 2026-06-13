namespace GNDJ.Application.Common.Interfaces;

public record EmailJob(string TemplateCode, string ToEmail, Dictionary<string, string> Variables);

// Fire-and-forget email queue. Enqueuing is instant; a background worker sends the emails so HTTP
// requests (e.g. batch demande responses) don't block on SMTP round-trips.
public interface IEmailQueue
{
    void Enqueue(EmailJob job);
}
