using System.Text.Json;
using System.Text.RegularExpressions;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Settings;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Email;

// « Aperçu » of an email template: the subject and body as a recipient would get them, rendered by the SAME code as
// a real send (EmailService.RenderAsync: year variables, {{year+N}}, HTML-encoding), with an example value for each
// variable the template declares. Works on the text being edited (not yet saved). Anything still between {{ }}
// afterwards would reach the recipient as-is — returned so the page can flag it.
public record PreviewEmailTemplateQuery(string Code, string Subject, string BodyHtml, string? Variables)
    : IRequest<Result<EmailPreviewDto>>;

public record EmailPreviewDto(string Subject, string BodyHtml, IReadOnlyList<string> Unreplaced);

public class PreviewEmailTemplateQueryValidator : AbstractValidator<PreviewEmailTemplateQuery>
{
    public PreviewEmailTemplateQueryValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Subject).MaximumLength(500);
        // TipTap HTML body (same exception as the template itself: rendered, never stored from here).
        RuleFor(x => x.BodyHtml).MaximumLength(200_000);
        RuleFor(x => x.Variables).MaximumLength(10_000);
    }
}

public partial class PreviewEmailTemplateQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailService email)
    : IRequestHandler<PreviewEmailTemplateQuery, Result<EmailPreviewDto>>
{
    public async ValueTask<Result<EmailPreviewDto>> Handle(PreviewEmailTemplateQuery request, CancellationToken ct)
    {
        if (!SettingsAccess.CanEditEmailTemplates(currentUser)) throw new UnauthorizedAccessException("Accès non autorisé.");

        var settings = await context.Settings.Where(s => s.Key == "app.base_url" || s.Key == "demande.rejection_reasons")
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        var baseUrl = (settings.GetValueOrDefault("app.base_url") ?? "https://gndj.org").TrimEnd('/');
        var samples = Samples(baseUrl, DefaultRejectionText(settings.GetValueOrDefault("demande.rejection_reasons")));

        // Each declared variable gets its example, else its label in brackets (« [Nom du membre] ») so it's visible.
        var values = new Dictionary<string, string>();
        // The year variables are left to RenderAsync, which fills them like a real send (2026-2027, 2026…).
        foreach (var (key, label) in Declared(request.Variables))
            if (!YearKeys.Contains(key))
                values[key] = samples.GetValueOrDefault(key) ?? $"[{(string.IsNullOrWhiteSpace(label) ? key : label)}]";

        var (subject, body) = await email.RenderAsync(request.Code, request.Subject ?? "", request.BodyHtml ?? "", values, ct);
        var unreplaced = Leftover().Matches(subject + "\n" + body).Select(m => m.Value).Distinct().ToList();
        return Result<EmailPreviewDto>.Success(new EmailPreviewDto(subject, body, unreplaced));
    }

    private static readonly HashSet<string> YearKeys = ["scoutYear", "previousScoutYear", "nextScoutYear", "year"];

    // Realistic example values for the variables the app's emails use (fictitious family).
    private static Dictionary<string, string> Samples(string baseUrl, string reason)
    {
        var today = LebanonClock.Today;
        string Day(DateOnly d) => d.ToString("dd/MM/yyyy");
        return new Dictionary<string, string>
        {
            ["memberName"] = "Karl KHOURY",
            ["childName"] = "Karl KHOURY",
            ["contactName"] = "Marie Khoury",
            ["leaderName"] = "Rita",
            ["username"] = "karl.khoury@scouts.gndj",
            ["unitName"] = "Troupe 3ème Beyrouth",
            ["roleName"] = "Chef d'unité",
            ["demandeNumber"] = "INS-2026-0123",
            ["keptNumber"] = "INS-2026-0123",
            ["deletedNumbers"] = "INS-2026-0124",
            ["reason"] = reason,
            ["activationLink"] = $"{baseUrl}/reset-password?token=EXEMPLE&setup=1",
            ["resetLink"] = $"{baseUrl}/reset-password?token=EXEMPLE",
            ["verifyLink"] = $"{baseUrl}/inscription/verify?token=EXEMPLE",
            ["loginUrl"] = $"{baseUrl}/login",
            ["portalUrl"] = $"{baseUrl}/inscription",
            ["documentsUrl"] = $"{baseUrl}/my-documents",
            ["appUrl"] = $"{baseUrl}/admin/documents-suivi",
            ["passageUrl"] = $"{baseUrl}/passage",
            ["rentreeUrl"] = $"{baseUrl}/rentree",
            ["aideUrl"] = $"{baseUrl}/aide",
            ["expiryDays"] = "30",
            ["expiryHours"] = "24",
            ["code"] = "482913",
            ["tempPassword"] = "Exemple2026!",
            ["count"] = "12",
            ["deadline"] = Day(today.AddDays(10)),
            ["passageDate"] = Day(today.AddDays(14)),
            ["dateDuJour"] = Day(today),
            ["dateLimiteReinscription"] = Day(today.AddDays(21)),
            ["datePremiereReunion"] = Day(today.AddDays(28)),
            ["signatureCG"] = "La Maîtrise de Groupe",
            ["documentsList"] = "Fiche médicale, Carte d'identité",
            ["tasksList"] = "Préparer le calendrier de l'unité, Vérifier les fiches médicales",
            ["unitsList"] = "Troupe 3ème Beyrouth, Meute 10ème Beyrouth",
            ["missing"] = "Karl KHOURY, Lea HADDAD",
            ["phase"] = "Dépôt des documents",
            ["overdueCount"] = "1",
            ["taskCount"] = "2",
            ["subject"] = "Objet du message",
            ["body"] = "Texte du message.",
            ["message"] = "Texte du message.",
            ["senderName"] = "Marie Khoury",
            ["senderEmail"] = "marie.khoury@example.com",
            ["note"] = "Le fichier est joint à cet email.",
            ["date"] = Day(today),
            ["timestamp"] = $"{Day(today)} 10:30",
        };
    }

    // The refusal text marked « par défaut » in Paramètres → Demandes (what {{reason}} usually holds).
    private static string DefaultRejectionText(string? json)
    {
        const string fallback = "Faute de place disponible dans l'unité concernée, nous ne pouvons pas donner suite à votre demande cette année.";
        if (string.IsNullOrWhiteSpace(json)) return fallback;
        try
        {
            using var doc = JsonDocument.Parse(json);
            JsonElement? first = null;
            foreach (var r in doc.RootElement.EnumerateArray())
            {
                first ??= r;
                if (r.TryGetProperty("IsDefault", out var d) && d.ValueKind == JsonValueKind.True && r.TryGetProperty("Text", out var t))
                    return t.GetString() ?? fallback;
            }
            return first is { } f && f.TryGetProperty("Text", out var ft) ? ft.GetString() ?? fallback : fallback;
        }
        catch (JsonException) { return fallback; }
    }

    // The template's declared variables ([{key,label}], as stored on EmailTemplate.Variables).
    private static IEnumerable<(string Key, string? Label)> Declared(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) yield break;
        List<(string, string?)> list = [];
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
                foreach (var v in doc.RootElement.EnumerateArray())
                    if (v.TryGetProperty("key", out var k) && k.GetString() is { Length: > 0 } key)
                        list.Add((key, v.TryGetProperty("label", out var l) ? l.GetString() : null));
        }
        catch (JsonException) { }
        foreach (var x in list) yield return x;
    }

    [GeneratedRegex(@"\{\{[^{}]*\}\}")] private static partial Regex Leftover();
}
