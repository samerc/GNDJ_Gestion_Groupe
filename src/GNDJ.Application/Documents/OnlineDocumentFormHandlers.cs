using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Application.DocumentTypes;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// « Remplir en ligne »: a document type with an in-app template and OnlineFillable on can be filled on the phone
// and signed with a finger. The app renders the signed PDF (same layout as the printed form, answers written in,
// signature block at the end) and saves it as that document — Pending, so the chef d'unité checks it exactly like
// an uploaded scan, and it counts for the dossier the same way. The download / fill by hand / upload way stays.
//
// Proof kept for the signature (simple electronic signature): signer name + relation, the « je certifie » tick,
// date/time, device (user agent) and IP, and the SHA-256 of the saved PDF — all in the audit log.

internal static class OnlineFormGate
{
    // Same rules as an upload: access to the member + the document campaign window / on-hold flag (leaders bypass),
    // the type must be fillable online, and nothing of this type may be waiting for the check already.
    public static async Task<(DocumentType? Type, string? Error)> CheckAsync(IApplicationDbContext context, ICurrentUserService user,
        Guid memberId, Guid documentTypeId, CancellationToken ct)
    {
        if (!await DocumentAccessHelper.CanAccessMember(context, user, memberId, ct)) return (null, "Accès non autorisé à ce membre.");
        var block = await DocumentAccessHelper.MemberUploadBlockReasonAsync(context, user, memberId, ct);
        if (block is not null) return (null, block);
        var dt = await context.DocumentTypes.FirstOrDefaultAsync(d => d.Id == documentTypeId && d.IsActive, ct);
        if (dt is null) return (null, "Type de document introuvable.");
        if (!dt.OnlineFillable || string.IsNullOrWhiteSpace(dt.TemplateHtml)) return (null, "Ce document ne peut pas être rempli en ligne.");
        var pending = await context.MemberDocuments.AnyAsync(d => d.MemberId == memberId && d.DocumentTypeId == documentTypeId
            && d.Status == DocumentStatus.Pending, ct);
        if (pending) return (null, "Ce document a déjà été envoyé et attend la vérification.");
        return (dt, null);
    }

    // Detects a template changed between opening the form and sending it (the keys f0, f1… would no longer match).
    public static string Hash(string html) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(html)))[..16].ToLowerInvariant();
}

public record OnlineDocumentFormDto(Guid DocumentTypeId, string DocumentTypeName, string MemberName, string Html,
    IReadOnlyList<TemplateFormField> Fields, string TemplateHash);

public record GetOnlineDocumentFormQuery(Guid MemberId, Guid DocumentTypeId) : IRequest<Result<OnlineDocumentFormDto>>;

public class GetOnlineDocumentFormQueryHandler(IApplicationDbContext context, ICurrentUserService user, IDocumentTemplateRenderer renderer)
    : IRequestHandler<GetOnlineDocumentFormQuery, Result<OnlineDocumentFormDto>>
{
    public async ValueTask<Result<OnlineDocumentFormDto>> Handle(GetOnlineDocumentFormQuery request, CancellationToken ct)
    {
        var (dt, error) = await OnlineFormGate.CheckAsync(context, user, request.MemberId, request.DocumentTypeId, ct);
        if (dt is null) return Result<OnlineDocumentFormDto>.Failure(error!);
        var values = await GenerateMemberDocumentTemplateQueryHandler.ResolveMemberValuesAsync(context, request.MemberId, ct);
        if (values is null) return Result<OnlineDocumentFormDto>.Failure("Membre introuvable.");
        var form = renderer.PrepareForm(dt.TemplateHtml!, values);
        return Result<OnlineDocumentFormDto>.Success(new OnlineDocumentFormDto(dt.Id, dt.Name,
            values.GetValueOrDefault("nomComplet") ?? "", form.Html, form.Fields, OnlineFormGate.Hash(dt.TemplateHtml!)));
    }
}

public static class OnlineFormRelations
{
    public static readonly string[] All = ["Père", "Mère", "Tuteur", "Tutrice", "Le membre lui-même"];
}

public record SubmitOnlineDocumentFormCommand(Guid MemberId, Guid DocumentTypeId, string TemplateHash,
    Dictionary<string, string> Answers, string SignerName, string SignerRelation, string SignaturePng, bool Certified)
    : IRequest<Result<Guid>>;

public class SubmitOnlineDocumentFormCommandValidator : AbstractValidator<SubmitOnlineDocumentFormCommand>
{
    public SubmitOnlineDocumentFormCommandValidator()
    {
        RuleFor(x => x.TemplateHash).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Answers).NotNull().Must(a => a.Count <= 300).WithMessage("Trop de réponses.");
        // Answers are printed in the PDF only (never shown as HTML), so "<" / ">" are allowed (« tension < 12 »);
        // keys must be the form's own f0, f1…
        RuleForEach(x => x.Answers).Must(kv => System.Text.RegularExpressions.Regex.IsMatch(kv.Key, "^f[0-9]{1,3}$") && (kv.Value?.Length ?? 0) <= 2000)
            .WithMessage("Réponse invalide ou trop longue (2000 caractères au maximum).");
        RuleFor(x => x.SignerName).NotEmpty().WithMessage("Indiquez votre nom.").MaximumLength(150).NoHtml();
        RuleFor(x => x.SignerRelation).Must(r => OnlineFormRelations.All.Contains(r)).WithMessage("Indiquez qui signe.");
        RuleFor(x => x.Certified).Equal(true).WithMessage("Cochez « Je certifie l'exactitude des informations ».");
        RuleFor(x => x.SignaturePng).NotEmpty().WithMessage("Signez dans le cadre.").MaximumLength(600_000).WithMessage("Signature trop lourde.");
    }
}

public class SubmitOnlineDocumentFormCommandHandler(IApplicationDbContext context, ICurrentUserService user,
    IDocumentTemplateRenderer renderer, IAuditService audit) : IRequestHandler<SubmitOnlineDocumentFormCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(SubmitOnlineDocumentFormCommand request, CancellationToken ct)
    {
        var (dt, error) = await OnlineFormGate.CheckAsync(context, user, request.MemberId, request.DocumentTypeId, ct);
        if (dt is null) return Result<Guid>.Failure(error!);
        if (OnlineFormGate.Hash(dt.TemplateHtml!) != request.TemplateHash)
            return Result<Guid>.Failure("Le formulaire a été modifié entre-temps. Rechargez la page et remplissez-le à nouveau.");

        // The signature: a PNG data URL (or bare base64) drawn in the box.
        var b64 = request.SignaturePng.Contains(',') ? request.SignaturePng[(request.SignaturePng.IndexOf(',') + 1)..] : request.SignaturePng;
        byte[] png;
        try { png = Convert.FromBase64String(b64); } catch (FormatException) { return Result<Guid>.Failure("Signature invalide."); }
        if (png.Length < 8 || png[0] != 0x89 || png[1] != 0x50 || png[2] != 0x4E || png[3] != 0x47)
            return Result<Guid>.Failure("Signature invalide.");

        var values = await GenerateMemberDocumentTemplateQueryHandler.ResolveMemberValuesAsync(context, request.MemberId, ct);
        if (values is null) return Result<Guid>.Failure("Membre introuvable.");
        // The form's blanks (kind, label, member-file target) — keys f0, f1… match the answers.
        var fields = renderer.PrepareForm(dt.TemplateHtml!, values).Fields;
        foreach (var f in fields.Where(f => f.Kind == "date"))
            if (request.Answers.TryGetValue(f.Key, out var dv) && !string.IsNullOrWhiteSpace(dv)
                && !DateOnly.TryParseExact(dv.Trim(), "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _))
                return Result<Guid>.Failure($"Date invalide{(string.IsNullOrWhiteSpace(f.Label) ? "" : $" : {f.Label}")}.");
        foreach (var (key, value) in request.Answers)
            if (!string.IsNullOrWhiteSpace(value)) values[TemplateFormAnswers.Key(key)] = value.Trim();

        var now = LebanonClock.Now;
        var reference = Guid.CreateVersion7().ToString("N")[..12].ToUpperInvariant();
        var pdf = renderer.Render(dt.TemplateHtml!, values, new TemplateSignature(png, request.SignerName.Trim(), request.SignerRelation,
            $"{now:dd/MM/yyyy} à {now:HH'h'mm}", reference));
        var pdfHash = Convert.ToHexString(SHA256.HashData(pdf)).ToLowerInvariant();

        // Save like an upload (uploads/documents), then the shared write path (document Pending, audit "Create").
        var memberName = values.GetValueOrDefault("nomComplet") ?? "membre";
        var fileName = $"{DocumentTemplatePdfNaming.Clean($"{dt.Name} - {memberName}")} - signé.pdf";
        var dir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "documents");
        Directory.CreateDirectory(dir);
        var unique = $"{Guid.CreateVersion7()}_{fileName}";
        var fullPath = Path.Combine(dir, unique);
        await File.WriteAllBytesAsync(fullPath, pdf, ct);

        Result<Guid> result;
        try
        {
            result = await MemberDocumentWriter.WriteAsync(context, audit, request.MemberId, dt.Id, null, null, null,
                [new SavedDocFile(Path.Combine("uploads", "documents", unique), fileName, pdf.Length, "application/pdf")],
                user.UserId, via: "formulaire en ligne signé", ct);
        }
        catch
        {
            try { File.Delete(fullPath); } catch { /* best effort */ }
            throw;
        }
        if (!result.IsSuccess) { try { File.Delete(fullPath); } catch { } return result; }

        await audit.LogAsync("Signature", "MemberDocument", result.Value, newValues: new
        {
            Member = memberName, Document = dt.Name, Signataire = request.SignerName.Trim(), Lien = request.SignerRelation,
            Reference = reference, Certifie = request.Certified, Empreinte = pdfHash, Appareil = user.UserAgent, Ip = user.IpAddress,
        }, cancellationToken: ct);

        await SaveIntoMemberFileAsync(request.MemberId, fields, request.Answers, memberName, dt.Name, ct);
        return result;
    }

    // « — du médecin de famille » → « Médecin de famille » (the form's sentence fragments read badly on the fiche).
    private static string CleanLabel(string? label)
    {
        var l = (label ?? "").Trim().TrimStart('—', '-', '–', ' ');
        foreach (var p in new[] { "de la ", "de l'", "de l’", "du ", "des ", "de " })
            if (l.StartsWith(p, StringComparison.OrdinalIgnoreCase)) { l = l[p.Length..]; break; }
        return l.Length == 0 ? l : char.ToUpper(l[0]) + l[1..];
    }

    // Blanks linked to the member's file (data-save) update the Médical tab: one line per answered blank,
    // « Label : réponse », in form order. A field is only replaced when at least one of its blanks was answered,
    // so an untouched part of the form never wipes what is already on the fiche.
    private async Task SaveIntoMemberFileAsync(Guid memberId, IReadOnlyList<TemplateFormField> fields,
        Dictionary<string, string> answers, string memberName, string documentName, CancellationToken ct)
    {
        string? Combine(string target)
        {
            var lines = fields.Where(f => f.Save == target)
                .Select(f => (f, v: answers.TryGetValue(f.Key, out var a) ? a?.Trim() : null))
                .Where(x => !string.IsNullOrWhiteSpace(x.v))
                .Select(x =>
                {
                    var v = x.f.Kind == "date" ? TemplateFormAnswers.DisplayDate(x.v!) : x.v!;
                    var label = CleanLabel(x.f.Label);
                    return label.Length == 0 ? v : $"{label} : {v}";
                }).ToList();
            if (lines.Count == 0) return null;
            var text = string.Join("\n", lines);
            return text.Length > 2000 ? text[..2000] : text; // same cap as the member form
        }

        var allergies = Combine(TemplateFormAnswers.SaveAllergies);
        var notes = Combine(TemplateFormAnswers.SaveMedicalNotes);
        if (allergies is null && notes is null) return;

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == memberId, ct);
        if (member is null) return;
        var old = new { member.Allergies, member.MedicalNotes };
        if (allergies is not null) member.Allergies = allergies;
        if (notes is not null) member.MedicalNotes = notes;
        if (old.Allergies == member.Allergies && old.MedicalNotes == member.MedicalNotes) return;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "Member", memberId, oldValues: new { Member = memberName, old.Allergies, old.MedicalNotes },
            newValues: new { Member = memberName, member.Allergies, member.MedicalNotes, Source = $"{documentName} (formulaire en ligne)" },
            cancellationToken: ct);
    }
}
