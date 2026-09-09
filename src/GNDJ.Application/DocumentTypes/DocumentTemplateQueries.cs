using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.DocumentTypes;

// Queries backing the in-app document-template builder: the placeholder catalog for the editor dropdown, a
// CG "Aperçu PDF" (sample values), and the per-member prefilled PDF (own record or a leader of the member).

// ── The placeholder catalog (for the "Insérer un champ" dropdown) ──
public record GetDocumentTemplateFieldsQuery() : IRequest<IReadOnlyList<DocumentTemplateField>>;

public class GetDocumentTemplateFieldsQueryHandler : IRequestHandler<GetDocumentTemplateFieldsQuery, IReadOnlyList<DocumentTemplateField>>
{
    public ValueTask<IReadOnlyList<DocumentTemplateField>> Handle(GetDocumentTemplateFieldsQuery request, CancellationToken ct)
        => ValueTask.FromResult(DocumentTemplateFields.All);
}

public record DocumentTemplatePdf(byte[] Data, string FileName);

public static class DocumentTemplatePdfNaming
{
    // A safe file name from a doc-type name (strip characters invalid in a file name).
    public static string Clean(string typeName)
    {
        var cleaned = string.Join("_", typeName.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries));
        return string.IsNullOrWhiteSpace(cleaned) ? "Document" : cleaned;
    }
}

// ── CG preview: render arbitrary (current, possibly-unsaved) template HTML with realistic sample values ──
// POST rather than by-id so the "Aperçu PDF" reflects the CG's live edits in the builder, not the last save.
public record PreviewDocumentTemplateQuery(string Html, string? Name) : IRequest<Result<DocumentTemplatePdf>>;

public class PreviewDocumentTemplateQueryHandler(IDocumentTemplateRenderer renderer)
    : IRequestHandler<PreviewDocumentTemplateQuery, Result<DocumentTemplatePdf>>
{
    public ValueTask<Result<DocumentTemplatePdf>> Handle(PreviewDocumentTemplateQuery request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Html))
            return ValueTask.FromResult(Result<DocumentTemplatePdf>.Failure("Le modèle est vide."));
        if (request.Html.Length > 100_000)
            return ValueTask.FromResult(Result<DocumentTemplatePdf>.Failure("Le modèle est trop long."));

        var name = string.IsNullOrWhiteSpace(request.Name) ? "Document" : request.Name!;
        var pdf = renderer.Render(request.Html, DocumentTemplateFields.SampleValues());
        return ValueTask.FromResult(Result<DocumentTemplatePdf>.Success(
            new DocumentTemplatePdf(pdf, $"{DocumentTemplatePdfNaming.Clean(name)} (aperçu).pdf")));
    }
}

// ── Per-member prefilled PDF (member's own record, or a leader of the member's active unit) ──
public record GenerateMemberDocumentTemplateQuery(Guid MemberId, Guid DocumentTypeId) : IRequest<Result<DocumentTemplatePdf>>;

public class GenerateMemberDocumentTemplateQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IDocumentTemplateRenderer renderer
) : IRequestHandler<GenerateMemberDocumentTemplateQuery, Result<DocumentTemplatePdf>>
{
    public async ValueTask<Result<DocumentTemplatePdf>> Handle(GenerateMemberDocumentTemplateQuery request, CancellationToken ct)
    {
        // Same access rule as the member card: own record always, else a members.edit leader of the member's unit.
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<DocumentTemplatePdf>.Failure("Accès non autorisé.");

        var dt = await context.DocumentTypes
            .Where(d => d.Id == request.DocumentTypeId)
            .Select(d => new { d.Name, d.TemplateHtml })
            .FirstOrDefaultAsync(ct);

        if (dt is null) return Result<DocumentTemplatePdf>.Failure("Type de document introuvable.");
        if (string.IsNullOrWhiteSpace(dt.TemplateHtml)) return Result<DocumentTemplatePdf>.Failure("Ce type de document n'a pas de modèle.");

        var values = await ResolveMemberValuesAsync(context, request.MemberId, ct);
        if (values is null) return Result<DocumentTemplatePdf>.Failure("Membre introuvable.");

        var pdf = renderer.Render(dt.TemplateHtml, values);
        // Friendly file name: "<Type> - <Nom complet> - <Code unité>.pdf" (e.g. "Fiche Medicale - Samer Cheaib - T2").
        var member = values.TryGetValue("nomComplet", out var nc) ? nc : null;
        var unitCode = values.TryGetValue("__unitcode", out var uc) ? uc : null;
        var parts = new[] { dt.Name, member, unitCode }
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => DocumentTemplatePdfNaming.Clean(p!.Trim()));
        return Result<DocumentTemplatePdf>.Success(new DocumentTemplatePdf(pdf, $"{string.Join(" - ", parts)}.pdf"));
    }

    // Builds the placeholder key → value map from the member's data. A missing value stays null → the renderer
    // leaves a blank (the "pick which fields prefill" behaviour: unpicked fields simply aren't in the template).
    internal static async Task<Dictionary<string, string?>?> ResolveMemberValuesAsync(
        IApplicationDbContext context, Guid memberId, CancellationToken ct)
    {
        var m = await context.Members
            .Where(x => x.Id == memberId)
            .Select(x => new
            {
                x.FirstName, x.LastName, x.DateOfBirth, x.Gender, x.BloodType, x.Nationality,
                x.School, x.Classe, x.Section, x.CardNumber, x.ExternalCardNumber,
                UnitName = x.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault(),
                UnitCode = x.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
                TeamName = x.Assignments.Where(a => a.EndDate == null && a.Team != null).Select(a => a.Team!.Name).FirstOrDefault(),
                RoleName = x.Assignments.Where(a => a.EndDate == null).Select(a => a.FunctionalRole.Name).FirstOrDefault(),
                StartDate = x.Assignments.Where(a => a.EndDate == null).Select(a => (DateOnly?)a.StartDate).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (m is null) return null;

        // Father / mother from the guardian links (RelationshipType = "Père" / "Mère").
        var parents = await context.GuardianLinks
            .Where(gl => gl.MemberId == memberId && (gl.RelationshipType == "Père" || gl.RelationshipType == "Mère"))
            .Select(gl => new
            {
                gl.RelationshipType,
                gl.Guardian.FirstName,
                gl.Guardian.LastName,
                Phone = gl.Guardian.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary)
                    .Select(p => (p.CountryCode + " " + p.Number).Trim()).FirstOrDefault(),
            })
            .ToListAsync(ct);

        var father = parents.FirstOrDefault(p => p.RelationshipType == "Père");
        var mother = parents.FirstOrDefault(p => p.RelationshipType == "Mère");

        // Scout year = the year the member's active assignment falls in (else the current scout year).
        var scoutYear = m.StartDate.HasValue ? ScoutYearHelper.Of(m.StartDate.Value) : ScoutYearHelper.Of(LebanonClock.Today);

        return new Dictionary<string, string?>
        {
            ["prenom"] = m.FirstName,
            ["nom"] = m.LastName,
            ["nomComplet"] = $"{m.FirstName} {m.LastName}".Trim(),
            ["dateNaissance"] = m.DateOfBirth?.ToString("dd/MM/yyyy"),
            ["genre"] = m.Gender,
            ["groupeSanguin"] = m.BloodType,
            ["nationalite"] = m.Nationality,
            ["ecole"] = m.School,
            ["classe"] = m.Classe,
            ["section"] = m.Section,
            ["matricule"] = m.CardNumber,
            ["numeroCarte"] = m.ExternalCardNumber,
            ["unite"] = m.UnitName,
            ["equipe"] = m.TeamName,
            ["fonction"] = m.RoleName,
            ["prenomPere"] = father?.FirstName,
            ["nomPere"] = father?.LastName,
            ["telephonePere"] = father?.Phone,
            ["prenomMere"] = mother?.FirstName,
            ["nomMere"] = mother?.LastName,
            ["telephoneMere"] = mother?.Phone,
            ["anneeScoute"] = scoutYear,
            ["dateDuJour"] = LebanonClock.Today.ToString("dd/MM/yyyy"),
            // Internal (not a template placeholder): the unit short code, used to name the downloaded file.
            ["__unitcode"] = m.UnitCode,
        };
    }
}
