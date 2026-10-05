using System.Text.Json;
using System.Text.RegularExpressions;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// « Emails reçus » on a member's fiche: the app's emails sent (or waiting / failed) to any address on this member's
// file — their own emails, the main contact email, their parents' emails, and the email of the family's enrolment
// account while it still exists. Answers "did they get the email?" without opening the email queue. Matching is by
// ADDRESS, so a parent shared with a brother or sister also shows the emails about that sibling (the subject says so).
// The email content is never returned (it can hold a set-password link); only the subject, built from the template
// with the email's own values — values whose name looks secret are left out.
public record MemberEmailAddressDto(string Address, string Owner, bool Bounced, string? BounceReason);

public record MemberEmailReceivedDto(Guid Id, DateTime CreatedAt, DateTime? SentAt, string Status, string ToEmail,
    string Owner, string TemplateName, string Subject, string? LastError);

public record MemberEmailsReceivedDto(List<MemberEmailAddressDto> Addresses, List<MemberEmailReceivedDto> Emails);

public record GetMemberEmailsReceivedQuery(Guid MemberId) : IRequest<Result<MemberEmailsReceivedDto>>;

public class GetMemberEmailsReceivedQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberEmailsReceivedQuery, Result<MemberEmailsReceivedDto>>
{
    private const int MaxEmails = 100;
    private static readonly Regex Var = new(@"\{\{\s*(\w+)\s*\}\}", RegexOptions.Compiled);

    public async ValueTask<Result<MemberEmailsReceivedDto>> Handle(GetMemberEmailsReceivedQuery request, CancellationToken ct)
    {
        var memberId = request.MemberId;
        if (!await MemberAccess.CanViewMemberAsync(context, currentUser, memberId, ct))
            return Result<MemberEmailsReceivedDto>.Failure("Accès non autorisé à ce membre.");

        var member = await context.Members.Where(m => m.Id == memberId)
            .Select(m => new { m.FirstName, m.PrimaryContactEmail }).FirstOrDefaultAsync(ct);
        if (member is null) return Result<MemberEmailsReceivedDto>.Failure("Membre introuvable.");

        // Address → who it belongs to (first owner found wins: the member, each parent, the account, then the main
        // contact email if it is none of those).
        var owners = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        void Add(string? address, string owner)
        {
            var a = address?.Trim();
            if (!string.IsNullOrEmpty(a)) owners.TryAdd(a, owner);
        }
        foreach (var e in await context.MemberEmails.Where(e => e.MemberId == memberId).Select(e => e.Address).ToListAsync(ct))
            Add(e, member.FirstName);
        var parents = await context.GuardianLinks.Where(l => l.MemberId == memberId)
            .SelectMany(l => l.Guardian.Emails.Select(e => new { e.Address, l.RelationshipType, l.Guardian.FirstName, l.Guardian.LastName }))
            .ToListAsync(ct);
        foreach (var p in parents)
            Add(p.Address, $"{p.RelationshipType} · {p.FirstName} {p.LastName}".Trim());
        var accountEmail = await context.Demandes.Where(d => d.CreatedMemberId == memberId)
            .Select(d => d.ApplicantAccount.Email).FirstOrDefaultAsync(ct);
        Add(accountEmail, "Compte d'inscription");
        Add(member.PrimaryContactEmail, "Email principal");

        var lowered = owners.Keys.Select(a => a.ToLowerInvariant()).ToList();
        var bounces = await context.EmailBounces.Where(b => lowered.Contains(b.Address))
            .Select(b => new { b.Address, b.Suppressed, b.Reason }).ToListAsync(ct);
        var addresses = owners.Select(o =>
        {
            var b = bounces.FirstOrDefault(x => x.Address == o.Key.ToLowerInvariant() && x.Suppressed);
            return new MemberEmailAddressDto(o.Key, o.Value, b is not null, b?.Reason);
        }).ToList();

        var rows = lowered.Count == 0 ? [] : await context.OutboxEmails
            .Where(e => lowered.Contains(e.ToEmail.ToLower()))
            .OrderByDescending(e => e.CreatedAt).Take(MaxEmails)
            .Select(e => new { e.Id, e.CreatedAt, e.SentAt, e.Status, e.ToEmail, e.TemplateCode, e.PayloadJson, e.LastError })
            .ToListAsync(ct);
        var codes = rows.Select(r => r.TemplateCode).Distinct().ToList();
        var templates = await context.EmailTemplates.IgnoreQueryFilters().Where(t => codes.Contains(t.Code))
            .Select(t => new { t.Code, t.Name, t.Subject }).ToListAsync(ct);

        var emails = rows.Select(r =>
        {
            var t = templates.FirstOrDefault(x => x.Code == r.TemplateCode);
            var vars = ReadVars(r.PayloadJson);
            var subject = vars.TryGetValue(EmailOverride.SubjectKey, out var custom) && !string.IsNullOrWhiteSpace(custom)
                ? custom : t?.Subject ?? r.TemplateCode;
            subject = Var.Replace(subject, m => vars.TryGetValue(m.Groups[1].Value, out var v) && !LooksSecret(m.Groups[1].Value) ? v : "…");
            return new MemberEmailReceivedDto(r.Id, r.CreatedAt, r.SentAt, r.Status.ToString(), r.ToEmail,
                owners.GetValueOrDefault(r.ToEmail.Trim(), ""), t?.Name ?? r.TemplateCode, subject,
                r.Status == OutboxEmailStatus.Failed ? Truncate(r.LastError, 300) : null);
        }).ToList();

        return Result<MemberEmailsReceivedDto>.Success(new MemberEmailsReceivedDto(addresses, emails));
    }

    private static Dictionary<string, string> ReadVars(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    private static bool LooksSecret(string key)
    {
        var k = key.ToLowerInvariant();
        return k.Contains("password") || k.Contains("token") || k.Contains("link") || k.Contains("code");
    }

    private static string? Truncate(string? s, int max) => s is null || s.Length <= max ? s : s[..max] + "…";
}
