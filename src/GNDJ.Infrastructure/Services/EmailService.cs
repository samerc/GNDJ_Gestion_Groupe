using System.Net;
using System.Net.Mail;
using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace GNDJ.Infrastructure.Services;

// Sends a templated email: loads the DB-stored EmailTemplate by code, resolves the SMTP server
// (the template's own, else the first active one), substitutes {{variables}}, and sends via
// System.Net.Mail. Variable substitution HTML-encodes user-supplied values for the HTML body as an
// XSS defense at the sink (see ReplaceVariables / SendAsync).
//
// PERF: the template + SMTP config and the override-recipient setting are effectively constant across a
// bulk send (e.g. "Envoyer les réponses" fans out hundreds of emails). They were previously re-read from
// the DB on EVERY send (3 queries each). We now cache the resolved values in the shared singleton
// IMemoryCache with a short TTL so a burst reads them once, not N times. Values are cached as plain
// immutable records (never EF entities) so they're safe to share across the per-send DI scopes/contexts.
public class EmailService : IEmailService
{
    private readonly GndjDbContext _context;
    private readonly IMemoryCache _cache;

    public EmailService(GndjDbContext context, IMemoryCache cache)
    {
        _context = context;
        _cache = cache;
    }

    // Resolved, connection-ready template — no EF entities, safe to cache/share across scopes.
    // ServerId + MaxPerHour let the outbox sender rate-limit per provider without re-querying.
    private sealed record ResolvedTemplate(
        string Subject, string BodyHtml,
        string Host, int Port, string? Username, string? Password, bool UseSsl, string FromEmail, string? FromName,
        Guid ServerId, int? MaxPerHour, IReadOnlyList<AttachmentRef> Attachments);

    // A template file attachment (stored as [{Name,Url}] on EmailTemplate.AttachmentsJson).
    private sealed record AttachmentRef(string Name, string Url);
    private static readonly JsonSerializerOptions AttJson = new() { PropertyNameCaseInsensitive = true };

    private static readonly TimeSpan TemplateTtl = TimeSpan.FromSeconds(60); // template/SMTP change rarely
    private static readonly TimeSpan OverrideTtl = TimeSpan.FromSeconds(15); // safety toggle — refresh quickly

    public async Task SendAsync(string templateCode, string toEmail, Dictionary<string, string> variables, CancellationToken ct = default)
    {
        var resolved = await ResolveTemplateAsync(templateCode, ct);

        // Replace variables in subject and body. The body is HTML, so user-supplied values are
        // HTML-encoded before substitution (the admin-authored template markup is left intact) to
        // prevent any injected markup/script from landing raw in the recipient's inbox. The subject
        // is plain text, so it's substituted verbatim (encoding it would show literal &amp; etc.).
        var subject = ReplaceVariables(resolved.Subject, variables, htmlEncode: false);
        var body = ReplaceVariables(resolved.BodyHtml, variables, htmlEncode: true);

        // Safety redirect: while `email.override_recipient` is set, EVERY email is sent to that single
        // address instead of the real recipient (the intended address is shown in the subject). Lets the
        // group test end-to-end without any mail reaching real families. Leave the setting empty to go live.
        var actualTo = toEmail;
        var overrideTo = await ResolveOverrideAsync(ct);
        if (!string.IsNullOrWhiteSpace(overrideTo))
        {
            subject = $"[TEST → {toEmail}] {subject}";
            actualTo = overrideTo.Trim();
        }

        using var client = new SmtpClient(resolved.Host, resolved.Port)
        {
            Credentials = new NetworkCredential(resolved.Username, resolved.Password),
            EnableSsl = resolved.UseSsl,
            Timeout = 30_000, // 30s backstop so a dead SMTP host can't hang the send (worker also has a CTS)
        };

        using var message = new MailMessage(
            new MailAddress(resolved.FromEmail, resolved.FromName),
            new MailAddress(actualTo))
        {
            Subject = subject,
            Body = body,
            IsBodyHtml = true
        };

        // Attach the template's files (e.g. an official rejection letter). Files live under uploads/content; a
        // missing file is skipped (never fails the send). MailMessage disposes its attachments with `using` above.
        foreach (var att in resolved.Attachments)
        {
            var path = ResolveAttachmentPath(att.Url);
            if (path is not null && File.Exists(path))
                message.Attachments.Add(new Attachment(path) { Name = string.IsNullOrWhiteSpace(att.Name) ? Path.GetFileName(path) : att.Name });
        }

        await client.SendMailAsync(message, ct);
    }

    // Maps a stored attachment URL (/api/v1/content/files/{file}) to its physical path under uploads/content.
    // Path-traversal guarded (only a bare file name in the uploads/content root is accepted).
    private static string? ResolveAttachmentPath(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var fileName = Path.GetFileName(url.TrimEnd('/')); // last segment; strips any path/query components
        if (string.IsNullOrWhiteSpace(fileName)) return null;
        var root = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads", "content"));
        var full = Path.GetFullPath(Path.Combine(root, fileName));
        return full.StartsWith(root) ? full : null;
    }

    // Template + SMTP config, cached briefly (missing/inactive templates throw and are NOT cached, so a
    // freshly activated template is picked up on the next send).
    private async Task<ResolvedTemplate> ResolveTemplateAsync(string templateCode, CancellationToken ct)
    {
        if (_cache.TryGetValue<ResolvedTemplate>($"emailtpl:{templateCode}", out var cached) && cached is not null)
            return cached;

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

        IReadOnlyList<AttachmentRef> attachments = [];
        if (!string.IsNullOrWhiteSpace(template.AttachmentsJson))
        {
            try { attachments = JsonSerializer.Deserialize<List<AttachmentRef>>(template.AttachmentsJson, AttJson) ?? []; }
            catch { attachments = []; }
        }

        var resolved = new ResolvedTemplate(template.Subject, template.BodyHtml,
            smtp.Host, smtp.Port, smtp.Username, smtp.Password, smtp.UseSsl, smtp.FromEmail, smtp.FromName,
            smtp.Id, smtp.MaxPerHour, attachments);
        _cache.Set($"emailtpl:{templateCode}", resolved, TemplateTtl);
        return resolved;
    }

    // Which server + per-hour cap a template routes to, without sending (reuses the cached resolution). Returns
    // null if the template/server can't be resolved so the sender treats the row as un-throttled and lets the
    // real send surface the error.
    public async Task<EmailRoute?> ResolveRouteAsync(string templateCode, CancellationToken ct = default)
    {
        try
        {
            var r = await ResolveTemplateAsync(templateCode, ct);
            return new EmailRoute(r.ServerId, r.MaxPerHour);
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    // The override-recipient setting, cached briefly. Empty string = no override (cached as "" so the miss
    // isn't retried every send). Short TTL so clearing it to go live takes effect quickly.
    private async Task<string> ResolveOverrideAsync(CancellationToken ct)
    {
        if (_cache.TryGetValue<string>("email:override", out var cached) && cached is not null)
            return cached;
        var overrideTo = await _context.Settings
            .Where(s => s.Key == "email.override_recipient")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct) ?? "";
        _cache.Set("email:override", overrideTo, OverrideTtl);
        return overrideTo;
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
