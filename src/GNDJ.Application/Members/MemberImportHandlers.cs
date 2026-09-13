using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Members.Commands.CreateMember;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// Bulk member import from an Excel/CSV file. Two steps: PREVIEW (dry-run — validate every row, no writes) then
// COMMIT (create the valid rows). Both take the uploaded file bytes and re-parse+re-validate server-side, so the
// commit never trusts client-provided rows. Gated on members.create (CG / super-admin). Each created member goes
// through the normal CreateMemberCommand (card number, login, optional parents + unit assignment), so import
// behaves exactly like manual creation. A unit given per row must be one the caller may place into.

// One parsed+validated row for the preview table.
public record MemberImportRowDto(
    int Row, string FirstName, string LastName, string? DateOfBirth, string? Gender,
    string? UnitName, bool Valid, IReadOnlyList<string> Errors);

public record MemberImportPreviewDto(
    IReadOnlyList<MemberImportRowDto> Rows, int ValidCount, int ErrorCount, IReadOnlyList<string> FileErrors);

public record MemberImportResultDto(int Created, int Failed, IReadOnlyList<string> Errors);

// ── Shared parsing/validation (used by both preview + commit) ──────────────────
internal static class MemberImportMapping
{
    // Known field → the header labels that map to it (matched accent/case-insensitively).
    public static readonly Dictionary<string, string[]> Columns = new()
    {
        ["firstName"] = ["prenom", "prénom", "first name", "firstname"],
        ["lastName"] = ["nom", "last name", "lastname", "nom de famille"],
        ["dob"] = ["date de naissance", "naissance", "dob", "date naissance"],
        ["gender"] = ["genre", "sexe", "gender"],
        ["nationality"] = ["nationalite", "nationalité", "nationality"],
        ["school"] = ["ecole", "école", "school"],
        ["classe"] = ["classe", "class"],
        ["section"] = ["section"],
        ["unit"] = ["unite", "unité", "unit", "unité (code)"],
        ["father"] = ["pere", "père", "father", "nom du pere"],
        ["mother"] = ["mere", "mère", "mother", "nom de la mere"],
        ["externalCard"] = ["numero de carte", "numéro de carte", "n° carte", "carte", "card number"],
        ["bloodType"] = ["groupe sanguin", "groupe", "blood type"],
    };

    // A parsed row = the mapped cell values by field key (missing/absent → null).
    public record Parsed(int Row, Dictionary<string, string> Fields);

    // Build a field-key → column-index map from the header row (accent/case-insensitive header matching).
    public static Dictionary<string, int> MapHeaders(IReadOnlyList<string> headers)
    {
        var map = new Dictionary<string, int>();
        for (var i = 0; i < headers.Count; i++)
        {
            var norm = TextNormalization.RemoveDiacritics(headers[i]).Trim().ToLowerInvariant();
            foreach (var (key, labels) in Columns)
                if (!map.ContainsKey(key) && labels.Any(l => TextNormalization.RemoveDiacritics(l).ToLowerInvariant() == norm))
                    map[key] = i;
        }
        return map;
    }

    public static string? Cell(IReadOnlyList<string> row, Dictionary<string, int> map, string key)
    {
        if (!map.TryGetValue(key, out var idx) || idx >= row.Count) return null;
        var v = row[idx]?.Trim();
        return string.IsNullOrWhiteSpace(v) ? null : v;
    }

    // Normalize a gender cell to "Masculin"/"Féminin" (accepts M/F, Garçon/Fille, etc.), else null.
    public static string? Gender(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var g = TextNormalization.RemoveDiacritics(raw).Trim().ToLowerInvariant();
        if (g is "m" or "masculin" or "garcon" or "homme" or "male") return "Masculin";
        if (g is "f" or "feminin" or "fille" or "femme" or "female") return "Féminin";
        return null;
    }

    // Parse a date cell — accepts dd/MM/yyyy, d/M/yyyy, yyyy-MM-dd (the common export/entry formats).
    public static DateOnly? Date(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        string[] formats = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "d/M/yy", "dd/MM/yy"];
        foreach (var f in formats)
            if (DateOnly.TryParseExact(raw.Trim(), f, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d))
                return d;
        return null;
    }
}

// ── PREVIEW ───────────────────────────────────────────────────────────────────
public record PreviewMemberImportCommand(byte[] File, string FileName) : IRequest<Result<MemberImportPreviewDto>>;

public class PreviewMemberImportCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IMemberImportService importer)
    : IRequestHandler<PreviewMemberImportCommand, Result<MemberImportPreviewDto>>
{
    public async ValueTask<Result<MemberImportPreviewDto>> Handle(PreviewMemberImportCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(Permissions.MembersCreate))
            return Result<MemberImportPreviewDto>.Failure("Accès non autorisé.");

        var (rows, fileErrors) = await ValidateFile(context, currentUser, importer, request.File, request.FileName, ct);
        if (rows is null) return Result<MemberImportPreviewDto>.Success(new MemberImportPreviewDto([], 0, 0, fileErrors));
        return Result<MemberImportPreviewDto>.Success(new MemberImportPreviewDto(
            rows, rows.Count(r => r.Valid), rows.Count(r => !r.Valid), fileErrors));
    }

    // Parse + validate every row. Returns (null, [fileError]) if the file itself is unusable. Shared with commit.
    public static async Task<(List<MemberImportRowDto>? Rows, List<string> FileErrors)> ValidateFile(
        IApplicationDbContext context, ICurrentUserService currentUser, IMemberImportService importer,
        byte[] file, string fileName, CancellationToken ct)
    {
        MemberImportFile parsed;
        try { parsed = importer.Parse(file, fileName); }
        catch { return (null, ["Fichier illisible. Utilisez le modèle (.xlsx) ou un .csv."]); }

        if (parsed.Rows.Count == 0) return (null, ["Le fichier ne contient aucune ligne de données."]);
        var map = MemberImportMapping.MapHeaders(parsed.Headers);
        var missing = new[] { "firstName", "lastName", "dob", "gender" }.Where(k => !map.ContainsKey(k)).ToList();
        if (missing.Count > 0)
            return (null, [$"Colonnes obligatoires manquantes : {string.Join(", ", missing.Select(FieldLabel))}. Utilisez le modèle."]);

        // Active units for resolving the optional "Unité" cell (by code or name). Scoped to what the caller may place into.
        var units = await context.Units
            .Where(u => u.IsActive)
            .Select(u => new { u.Id, u.Name, u.Code })
            .ToListAsync(ct);
        var allowedUnit = (Guid id) => currentUser.IsSuperAdmin || currentUser.AuthorizedUnitIds.Contains(id);

        var result = new List<MemberImportRowDto>();
        var lineNo = 1; // header is line 1
        foreach (var raw in parsed.Rows)
        {
            lineNo++;
            var errors = new List<string>();
            var first = MemberImportMapping.Cell(raw, map, "firstName");
            var last = MemberImportMapping.Cell(raw, map, "lastName");
            var dobRaw = MemberImportMapping.Cell(raw, map, "dob");
            var genderRaw = MemberImportMapping.Cell(raw, map, "gender");
            var unitRaw = MemberImportMapping.Cell(raw, map, "unit");

            if (string.IsNullOrWhiteSpace(first)) errors.Add("Prénom manquant");
            if (string.IsNullOrWhiteSpace(last)) errors.Add("Nom manquant");

            var dob = MemberImportMapping.Date(dobRaw);
            if (dobRaw is null) errors.Add("Date de naissance manquante");
            else if (dob is null) errors.Add($"Date de naissance invalide (« {dobRaw} » — attendu JJ/MM/AAAA)");
            else if (dob > LebanonClock.Today) errors.Add("Date de naissance dans le futur");

            var gender = MemberImportMapping.Gender(genderRaw);
            if (genderRaw is null) errors.Add("Genre manquant");
            else if (gender is null) errors.Add($"Genre invalide (« {genderRaw} » — attendu Masculin/Féminin)");

            string? unitName = null;
            if (unitRaw is not null)
            {
                var normU = TextNormalization.RemoveDiacritics(unitRaw).Trim().ToLowerInvariant();
                var unit = units.FirstOrDefault(u => (u.Code ?? "").ToLowerInvariant() == normU)
                        ?? units.FirstOrDefault(u => TextNormalization.RemoveDiacritics(u.Name).ToLowerInvariant() == normU);
                if (unit is null) errors.Add($"Unité introuvable (« {unitRaw} »)");
                else if (!allowedUnit(unit.Id)) errors.Add($"Unité non autorisée (« {unitRaw} »)");
                else unitName = unit.Name;
            }

            result.Add(new MemberImportRowDto(lineNo, first ?? "", last ?? "", dob?.ToString("dd/MM/yyyy") ?? dobRaw,
                gender ?? genderRaw, unitName, errors.Count == 0, errors));
        }
        return (result, []);
    }

    private static string FieldLabel(string key) => key switch
    {
        "firstName" => "Prénom", "lastName" => "Nom", "dob" => "Date de naissance", "gender" => "Genre", _ => key,
    };
}

// ── COMMIT ────────────────────────────────────────────────────────────────────
public record CommitMemberImportCommand(byte[] File, string FileName) : IRequest<Result<MemberImportResultDto>>;

public class CommitMemberImportCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IMemberImportService importer, IMediator mediator)
    : IRequestHandler<CommitMemberImportCommand, Result<MemberImportResultDto>>
{
    public async ValueTask<Result<MemberImportResultDto>> Handle(CommitMemberImportCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(Permissions.MembersCreate))
            return Result<MemberImportResultDto>.Failure("Accès non autorisé.");

        // Re-parse the raw file so we can re-read the FULL cell set (the preview DTO only carries a summary).
        MemberImportFile parsed;
        try { parsed = importer.Parse(request.File, request.FileName); }
        catch { return Result<MemberImportResultDto>.Failure("Fichier illisible. Utilisez le modèle (.xlsx) ou un .csv."); }
        if (parsed.Rows.Count == 0) return Result<MemberImportResultDto>.Failure("Le fichier ne contient aucune ligne de données.");

        var map = MemberImportMapping.MapHeaders(parsed.Headers);
        if (new[] { "firstName", "lastName", "dob", "gender" }.Any(k => !map.ContainsKey(k)))
            return Result<MemberImportResultDto>.Failure("Colonnes obligatoires manquantes. Utilisez le modèle.");

        var units = await context.Units.Where(u => u.IsActive)
            .Select(u => new { u.Id, u.Name, u.Code }).ToListAsync(ct);

        int created = 0, failed = 0;
        var errors = new List<string>();
        var lineNo = 1;
        foreach (var raw in parsed.Rows)
        {
            lineNo++;
            var first = MemberImportMapping.Cell(raw, map, "firstName");
            var last = MemberImportMapping.Cell(raw, map, "lastName");
            var dob = MemberImportMapping.Date(MemberImportMapping.Cell(raw, map, "dob"));
            var gender = MemberImportMapping.Gender(MemberImportMapping.Cell(raw, map, "gender"));
            if (string.IsNullOrWhiteSpace(first) || string.IsNullOrWhiteSpace(last) || dob is null || gender is null)
            { failed++; errors.Add($"Ligne {lineNo} : données obligatoires manquantes ou invalides."); continue; }

            Guid? unitId = null;
            var unitRaw = MemberImportMapping.Cell(raw, map, "unit");
            if (unitRaw is not null)
            {
                var normU = TextNormalization.RemoveDiacritics(unitRaw).Trim().ToLowerInvariant();
                var unit = units.FirstOrDefault(u => (u.Code ?? "").ToLowerInvariant() == normU)
                        ?? units.FirstOrDefault(u => TextNormalization.RemoveDiacritics(u.Name).ToLowerInvariant() == normU);
                if (unit is null) { failed++; errors.Add($"Ligne {lineNo} : unité introuvable (« {unitRaw} »)."); continue; }
                if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(unit.Id))
                { failed++; errors.Add($"Ligne {lineNo} : unité non autorisée (« {unitRaw} »)."); continue; }
                unitId = unit.Id;
            }

            // Reuse the normal creation path (card number, login, optional parents + unit assignment). Blank
            // nationality/school default sensibly so the CreateMember validators pass for a lean import file.
            var cmd = new CreateMemberCommand(
                FirstName: first!,
                LastName: last!.ToUpperInvariant(),
                DateOfBirth: dob,
                Gender: gender,
                CardNumber: null,
                ExternalCardNumber: MemberImportMapping.Cell(raw, map, "externalCard"),
                BloodType: MemberImportMapping.Cell(raw, map, "bloodType"),
                Nationality: MemberImportMapping.Cell(raw, map, "nationality") ?? "Libanaise",
                School: MemberImportMapping.Cell(raw, map, "school") ?? "Autre",
                Classe: MemberImportMapping.Cell(raw, map, "classe"),
                Section: MemberImportMapping.Cell(raw, map, "section"),
                MedicalNotes: null, Allergies: null, Notes: null,
                FatherName: MemberImportMapping.Cell(raw, map, "father"),
                MotherName: MemberImportMapping.Cell(raw, map, "mother"),
                MotherMaidenName: null,
                UnitId: unitId);

            var res = await mediator.Send(cmd, ct);
            if (res.IsSuccess) created++;
            else { failed++; errors.Add($"Ligne {lineNo} ({first} {last}) : {res.Error}"); }
        }

        // Cap the error list so a huge bad file doesn't return a massive payload.
        if (errors.Count > 100) errors = [.. errors.Take(100), $"… (+{errors.Count - 100} autres)"];
        return Result<MemberImportResultDto>.Success(new MemberImportResultDto(created, failed, errors));
    }
}
