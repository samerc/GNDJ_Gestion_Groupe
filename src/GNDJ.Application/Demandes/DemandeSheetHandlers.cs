using FluentValidation;
using GNDJ.Application.Applicants; // ApplicantGuardianDto / ApplicantScoutRelationDto (for formatting the full file)
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Reports; // ExportResult
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// Excel round-trip of CG decisions (the Maîtrise works in Excel). Export = one row per submitted demande with a
// SINGLE "Décision" column (type a unit CODE to accept, a rejection-reason code / "--" to decline); Import =
// read it back and STAGE the decisions (same effect as the web review — nothing is sent/converted until
// "Envoyer les réponses"). Re-import is allowed. A "Codes" reference sheet lists every valid code.

// ── Export ─────────────────────────────────────────────────────────────────────────────────────────────────
public record ExportDemandeDecisionsQuery(string ScoutYear) : IRequest<Result<ExportResult>>;

public class ExportDemandeDecisionsQueryHandler(IApplicationDbContext context, IDemandeSheetService sheet)
    : IRequestHandler<ExportDemandeDecisionsQuery, Result<ExportResult>>
{
    public async ValueTask<Result<ExportResult>> Handle(ExportDemandeDecisionsQuery request, CancellationToken ct)
    {
        // Submitted, not-yet-sent demandes (drafts excluded). Staged Approved/Declined are included so the sheet
        // pre-fills the current decision + unit and a re-import can change them.
        var demandes = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && d.ResponseSentAt == null && d.Status != DemandeStatus.Draft)
            .OrderBy(d => d.LastName).ThenBy(d => d.FirstName)
            .ToListAsync(ct);

        // Build the FULL reviewable file (child + household + detailed parents/proches/fratrie) — the exact same
        // projection the CG review table uses, so the Excel carries everything the on-screen file shows.
        var dtos = await DemandeReviewProjection.BuildAsync(context, demandes, request.ScoutYear, LebanonClock.Today, ct);

        // Unit CODE per unit (for prefilling a staged approval) + all active units (code,name) for the reference
        // sheet / dropdown.
        var allUnits = await context.Units.Select(u => new { u.Id, u.Code, u.Name, u.IsActive }).ToListAsync(ct);
        var unitCodeById = allUnits.ToDictionary(u => u.Id, u => u.Code);
        var activeUnitList = allUnits.Where(u => u.IsActive).OrderBy(u => u.Name).Select(u => (u.Code, u.Name)).ToList();

        // Rejection reasons (managed list) — (code,label) for the reference sheet + normalized(text)→code so a
        // staged decline prefills the reason code it was decided with (falls back to "--").
        var reasonsJson = await context.Settings.Where(s => s.Key == DemandeRejectionReasons.SettingKey)
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        var reasons = DemandeRejectionReasons.Parse(reasonsJson);
        var reasonList = reasons.Select(rr => (rr.Code, rr.Label)).ToList();
        var defaultReasonLabel = reasons.FirstOrDefault(rr => rr.IsDefault)?.Label;
        var reasonCodeByText = reasons
            .GroupBy(rr => TextNormalization.NormalizeKey(DemandeRejectionReasons.TextOf(rr)))
            .ToDictionary(g => g.Key, g => g.First().Code);

        static string StatusLabel(string s) => s switch
        {
            DemandeStatus.Approved => "Accepté (à envoyer)",
            DemandeStatus.Declined => "Refusé (à envoyer)",
            _ => "Soumise",
        };

        // Prefill the single Décision cell from the current staged decision.
        string Prefill(string status, Guid? unitId, string? notes)
        {
            if (status == DemandeStatus.Approved && unitId != null)
                return unitCodeById.GetValueOrDefault(unitId.Value, "");
            if (status == DemandeStatus.Declined)
            {
                var key = TextNormalization.NormalizeKey(notes ?? "");
                return reasonCodeByText.TryGetValue(key, out var code) ? code : "--";
            }
            return "";
        }

        var rows = dtos.Select(d => new DemandeExportRow(
            d.Id, d.SerialNumber ?? "", Prefill(d.Status, d.DecidedUnitId, d.DecisionNotes), StatusLabel(d.Status),
            d.FirstName, d.LastName, d.DateOfBirth?.ToString("dd/MM/yyyy"), d.Age, d.Gender, d.Nationality,
            d.Classe, d.Section, d.School, d.BloodType, d.Allergies, d.MedicalNotes,
            FormatPhone(d.PhoneCountryCode, d.PhoneNumber), d.Email,
            d.AddressCountry, d.AddressCity, d.AddressDetails, d.ParentsSituation,
            FormatGuardians(d.Guardians), FormatRelations(d.ScoutRelations), FormatSiblings(d.Siblings),
            d.HasPreviousDemande ? $"Oui{(string.IsNullOrWhiteSpace(d.PreviousDemandeYear) ? "" : $" ({d.PreviousDemandeYear})")}" : "",
            d.ParentNotes, d.SubmittedAt?.ToString("dd/MM/yyyy")))
            .ToList();

        var bytes = sheet.Export($"Demandes {request.ScoutYear}", rows, activeUnitList, reasonList, defaultReasonLabel);
        var fileName = $"Demandes_{request.ScoutYear.Replace(" ", "")}.xlsx";
        return Result<ExportResult>.Success(new ExportResult(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName));
    }

    // ── Full-file formatters (multi-line strings written into single Excel cells with wrap) ──────────────────
    private static string FormatPhone(string? cc, string? number)
        => string.Join(" ", new[] { cc, number }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();

    private static string FormatGuardians(IReadOnlyList<ApplicantGuardianDto> gs)
        => string.Join("\n", gs.Select(g =>
        {
            var name = $"{g.FirstName} {g.LastName}".Trim();
            var rel = string.IsNullOrWhiteSpace(g.Relationship) ? "Parent" : g.Relationship;
            var parts = new List<string> { $"{rel} : {name}".Trim() };
            var phone = FormatPhone(g.PhoneCountryCode, g.PhoneNumber);
            if (!string.IsNullOrWhiteSpace(phone)) parts.Add(phone);
            if (!string.IsNullOrWhiteSpace(g.Email)) parts.Add(g.Email!);
            var prof = string.Join(" ", new[] { g.ProfessionDomain, g.Profession }.Where(s => !string.IsNullOrWhiteSpace(s)));
            if (!string.IsNullOrWhiteSpace(prof)) parts.Add(prof);
            if (g.IsEmergencyContact) parts.Add("(urgence)");
            if (g.IsDeceased) parts.Add("(décédé·e)");
            return string.Join(" · ", parts);
        }));

    private static string FormatRelations(IReadOnlyList<ApplicantScoutRelationDto> rs)
        => string.Join("\n", rs.Select(r =>
        {
            var name = $"{r.FirstName} {r.LastName}".Trim();
            var status = r.Status switch
            {
                "CurrentInGroup" => "Membre GNDJ",
                "AncienInGroup" => "Ancien membre GNDJ",
                "OtherGroup" => "Autre groupe",
                _ => r.Status,
            };
            var where = !string.IsNullOrWhiteSpace(r.OtherGroupName) ? r.OtherGroupName
                : !string.IsNullOrWhiteSpace(r.LastUnit) ? r.LastUnit : null;
            var s = $"{(string.IsNullOrWhiteSpace(name) ? "—" : name)} — {status}";
            if (!string.IsNullOrWhiteSpace(where)) s += $" ({where})";
            if (!string.IsNullOrWhiteSpace(r.Relationship)) s += $" [{r.Relationship}]";
            if (!string.IsNullOrWhiteSpace(r.RelatedMemberName)) s += $" → membre : {r.RelatedMemberName}{(string.IsNullOrWhiteSpace(r.RelatedMemberUnit) ? "" : $" ({r.RelatedMemberUnit})")}";
            return s;
        }));

    private static string FormatSiblings(IReadOnlyList<SiblingDto> sibs)
        => string.Join("\n", sibs.Select(s => $"{s.FirstName} {s.LastName}".Trim()));
}

// ── Import ─────────────────────────────────────────────────────────────────────────────────────────────────
public record ImportDemandeDecisionsResult(int Applied, int Skipped, IReadOnlyList<string> Errors);
public record ImportDemandeDecisionsCommand(string ScoutYear, byte[] File) : IRequest<Result<ImportDemandeDecisionsResult>>;

public class ImportDemandeDecisionsCommandValidator : AbstractValidator<ImportDemandeDecisionsCommand>
{
    public ImportDemandeDecisionsCommandValidator()
    {
        RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20);
        RuleFor(x => x.File).NotEmpty().WithMessage("Fichier vide.")
            .Must(f => f.Length <= 10 * 1024 * 1024).WithMessage("Fichier trop volumineux (max 10 Mo).");
    }
}

public class ImportDemandeDecisionsCommandHandler(IApplicationDbContext context, IDemandeSheetService sheet, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ImportDemandeDecisionsCommand, Result<ImportDemandeDecisionsResult>>
{
    public async ValueTask<Result<ImportDemandeDecisionsResult>> Handle(ImportDemandeDecisionsCommand request, CancellationToken ct)
    {
        IReadOnlyList<DemandeDecisionRow> rows;
        try { rows = sheet.Parse(request.File); }
        catch (DemandeSheetFormatException ex) { return Result<ImportDemandeDecisionsResult>.Failure(ex.Message); } // missing Réf./Décision column
        catch { return Result<ImportDemandeDecisionsResult>.Failure("Fichier illisible. Utilisez le modèle exporté (.xlsx)."); }

        // Decidable demandes of this year, keyed by id.
        var demandes = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && d.ResponseSentAt == null && d.Status != DemandeStatus.Draft)
            .ToDictionaryAsync(d => d.Id, ct);

        // Active units by normalized CODE (primary) and NAME (fallback), for the Décision column.
        var units = await context.Units.Where(u => u.IsActive).Select(u => new { u.Id, u.Code, u.Name }).ToListAsync(ct);
        var unitByCode = new Dictionary<string, Guid>();
        var unitByName = new Dictionary<string, Guid>();
        foreach (var u in units)
        {
            if (!string.IsNullOrWhiteSpace(u.Code)) unitByCode[TextNormalization.NormalizeKey(u.Code)] = u.Id;
            unitByName[TextNormalization.NormalizeKey(u.Name)] = u.Id;
        }

        // Rejection reasons (managed list) for resolving decline codes ("--" → default reason).
        var reasonsJson = await context.Settings.Where(s => s.Key == DemandeRejectionReasons.SettingKey)
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        var reasons = DemandeRejectionReasons.Parse(reasonsJson);

        var errors = new List<string>();
        int applied = 0, skipped = 0;

        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.Decision)) { skipped++; continue; } // no decision = leave as-is

            if (row.Id is null) { errors.Add($"Ligne {row.RowNumber} : référence manquante ou invalide."); continue; }
            if (!demandes.TryGetValue(row.Id.Value, out var demande))
            { errors.Add($"Ligne {row.RowNumber} : demande introuvable (ou déjà envoyée)."); continue; }

            var raw = row.Decision.Trim();
            var key = TextNormalization.NormalizeKey(raw);

            // 1) A unit code (or unit name) → ACCEPT into that unit.
            if (unitByCode.TryGetValue(key, out var unitId) || unitByName.TryGetValue(key, out unitId))
            {
                demande.Status = DemandeStatus.Approved;
                demande.DecidedUnitId = unitId;
                demande.DecisionNotes = null;
            }
            // 2) A rejection-reason code (or "--" for the default) → DECLINE with that reason's text.
            else
            {
                var reason = DemandeRejectionReasons.Resolve(reasons, raw);
                if (reason is null)
                {
                    var hint = raw is "--" or "-" ? "aucun motif par défaut n'est configuré" : "code inconnu (unité ou motif de refus)";
                    errors.Add($"Ligne {row.RowNumber} ({demande.FirstName} {demande.LastName}) : « {raw} » — {hint}.");
                    continue;
                }
                var notes = DemandeRejectionReasons.TextOf(reason);
                if (notes.Length > 1000) notes = notes[..1000];
                demande.Status = DemandeStatus.Declined;
                demande.DecidedUnitId = null;
                demande.DecisionNotes = notes;
            }

            demande.ReviewedByUserId = currentUser.UserId;
            demande.ReviewedAt = DateTime.UtcNow;
            applied++;
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("ImportDecisions", "Demande", null, newValues: new { applied, skipped, errors = errors.Count, request.ScoutYear }, cancellationToken: ct);
        return Result<ImportDemandeDecisionsResult>.Success(new ImportDemandeDecisionsResult(applied, skipped, errors));
    }
}
