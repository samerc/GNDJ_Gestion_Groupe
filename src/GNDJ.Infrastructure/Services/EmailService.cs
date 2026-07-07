using System.Net;
using System.Net.Mail;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Infrastructure.Services;

// Sends a templated email: loads the DB-stored EmailTemplate by code, resolves the SMTP server
// (the template's own, else the first active one), substitutes {{variables}}, and sends via
// System.Net.Mail. Variable substitution HTML-encodes user-supplied values for the HTML body as an
// XSS defense at the sink (see ReplaceVariables / SendAsync).
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

        // Get SMTP server: the template's own, else the OLDEST active one. Ordering makes the fallback
        // deterministic (previously "first active" with no order → arbitrary if several are active). Bind a
        // server to each template, or keep exactly one active, to be sure which one is used.
        var smtp = template.SmtpServer;
        if (smtp is null || !smtp.IsActive)
        {
            smtp = await _context.SmtpServers
                .Where(s => s.IsActive && !s.IsDeleted)
                .OrderBy(s => s.CreatedAt)
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

        // Safety redirect: while `email.override_recipient` is set, EVERY email is sent to that single
        // address instead of the real recipient (the intended address is shown in the subject). Lets the
        // group test end-to-end without any mail reaching real families. Leave the setting empty to go live.
        var actualTo = toEmail;
        var overrideTo = await _context.Settings
            .Where(s => s.Key == "email.override_recipient")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(overrideTo))
        {
            subject = $"[TEST → {toEmail}] {subject}";
            actualTo = overrideTo.Trim();
        }

        using var client = new SmtpClient(smtp.Host, smtp.Port)
        {
            Credentials = new NetworkCredential(smtp.Username, smtp.Password),
            EnableSsl = smtp.UseSsl,
            Timeout = 30_000, // 30s backstop so a dead SMTP host can't hang the send (worker also has a CTS)
        };

        using var message = new MailMessage(
            new MailAddress(smtp.FromEmail, smtp.FromName),
            new MailAddress(actualTo))
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
