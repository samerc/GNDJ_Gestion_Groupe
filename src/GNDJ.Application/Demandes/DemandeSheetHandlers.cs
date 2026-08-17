using FluentValidation;
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
            .Select(d => new
            {
                d.Id, d.ApplicantAccountId, d.FirstName, d.LastName, d.DateOfBirth, d.Gender, d.Classe, d.School,
                d.Status, d.DecidedUnitId, d.DecisionNotes
            })
            .ToListAsync(ct);

        var accountIds = demandes.Select(d => d.ApplicantAccountId).Distinct().ToList();
        // Parents' names per account (no contact details).
        var guardians = (await context.ApplicantGuardians
                .Where(g => accountIds.Contains(g.ApplicantAccountId))
                .Select(g => new { g.ApplicantAccountId, g.FirstName, g.LastName }).ToListAsync(ct))
            .GroupBy(g => g.ApplicantAccountId)
            .ToDictionary(g => g.Key, g => string.Join(", ", g.Select(x => $"{x.FirstName} {x.LastName}".Trim())));
        var relationCounts = (await context.ApplicantScoutRelations
                .Where(r => accountIds.Contains(r.ApplicantAccountId))
                .Select(r => r.ApplicantAccountId).ToListAsync(ct))
            .GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        var siblingCounts = demandes.GroupBy(d => d.ApplicantAccountId).ToDictionary(g => g.Key, g => g.Count());

        // Unit CODE per decided unit (for prefilling a staged approval) + all active units (code,name) for the
        // reference sheet / dropdown.
        var unitIds = demandes.Where(d => d.DecidedUnitId != null).Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var unitCodeById = await context.Units.Where(u => unitIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Code, ct);
        var activeUnits = await context.Units.Where(u => u.IsActive).OrderBy(u => u.Name)
            .Select(u => new { u.Code, u.Name }).ToListAsync(ct);
        var activeUnitList = activeUnits.Select(u => (u.Code, u.Name)).ToList();

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
        string Prefill(Guid id, string status, Guid? unitId, string? notes)
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

        var rows = demandes.Select(d => new DemandeExportRow(
            d.Id, d.FirstName, d.LastName, d.DateOfBirth?.ToString("dd/MM/yyyy"), d.Gender, d.Classe, d.School,
            guardians.GetValueOrDefault(d.ApplicantAccountId, ""),
            Math.Max(0, siblingCounts.GetValueOrDefault(d.ApplicantAccountId, 1) - 1),
            relationCounts.GetValueOrDefault(d.ApplicantAccountId, 0),
            StatusLabel(d.Status),
            Prefill(d.Id, d.Status, d.DecidedUnitId, d.DecisionNotes)))
            .ToList();

        var bytes = sheet.Export($"Demandes {request.ScoutYear}", rows, activeUnitList, reasonList, defaultReasonLabel);
        var fileName = $"Demandes_{request.ScoutYear.Replace(" ", "")}.xlsx";
        return Result<ExportResult>.Success(new ExportResult(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName));
    }
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
