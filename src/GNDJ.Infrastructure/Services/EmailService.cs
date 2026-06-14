using System.Net;
using System.Net.Mail;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Services;

public class EmailService : IEmailService
{
    private readonly GndjDbContext _context;

    public EmailService(GndjDbContext context) => _context = context;

    public async Task SendAsync(string templateCode, string toEmail, Dictionary<string, string> variables, CancellationToken ct = default)
    {
        var template = await _context.EmailTemplates
            .Include(t => t.SmtpServer)
            .FirstOrDefaultAsync(t => t.Code == templateCode && t.IsActive, ct);

        if (template is null)
            throw new InvalidOperationException($"Email template '{templateCode}' not found or inactive.");

        // Get SMTP server: template-specific or first active one
        var smtp = template.SmtpServer;
        if (smtp is null || !smtp.IsActive)
        {
            smtp = await _context.SmtpServers
                .Where(s => s.IsActive && !s.IsDeleted)
                .FirstOrDefaultAsync(ct);
        }

        if (smtp is null)
            throw new InvalidOperationException("No active SMTP server configured.");

        // Replace variables in subject and body. The body is HTML, so user-supplied values are
        // HTML-encoded before substitution (the admin-authored template markup is left intact) to
        // prevent any injected markup/script from landing raw in the recipient's inbox. The subject
        // is plain text, so it's substituted verbatim (encoding it would show literal &amp; etc.).
        var subject = ReplaceVariables(template.Subject, variables, htmlEncode: false);
        var body = ReplaceVariables(template.BodyHtml, variables, htmlEncode: true);

        using var client = new SmtpClient(smtp.Host, smtp.Port)
        {
            Credentials = new NetworkCredential(smtp.Username, smtp.Password),
            EnableSsl = smtp.UseSsl
        };

        var message = new MailMessage(
            new MailAddress(smtp.FromEmail, smtp.FromName),
            new MailAddress(toEmail))
        {
            Subject = subject,
            Body = body,
            IsBodyHtml = true
        };

        await client.SendMailAsync(message, ct);
    }

    private static string ReplaceVariables(string template, Dictionary<string, string> variables, bool htmlEncode)
    {
        foreach (var (key, value) in variables)
        {
            var safe = htmlEncode ? WebUtility.HtmlEncode(value) : value;
            template = template.Replace($"{{{{{key}}}}}", safe);
        }
        return template;
    }
}
