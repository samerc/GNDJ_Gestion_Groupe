using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Reports; // ExportResult
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// Excel round-trip of CG decisions (the Maîtrise works in Excel). Export = one row per submitted demande with
// Décision/Unité/Motif columns to fill; Import = read them back and STAGE the decisions (same effect as the web
// review — nothing is sent/converted until "Envoyer les réponses"). Re-import is allowed.

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
                d.Status, d.DecidedUnitId
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

        var unitIds = demandes.Where(d => d.DecidedUnitId != null).Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var unitNamesById = await context.Units.Where(u => unitIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var activeUnitNames = await context.Units.Where(u => u.IsActive).OrderBy(u => u.Name).Select(u => u.Name).ToListAsync(ct);

        static string StatusLabel(string s) => s switch
        {
            DemandeStatus.Approved => "Accepté (à envoyer)",
            DemandeStatus.Declined => "Refusé (à envoyer)",
            _ => "Soumise",
        };

        var rows = demandes.Select(d => new DemandeExportRow(
            d.Id, d.FirstName, d.LastName, d.DateOfBirth?.ToString("dd/MM/yyyy"), d.Gender, d.Classe, d.School,
            guardians.GetValueOrDefault(d.ApplicantAccountId, ""),
            Math.Max(0, siblingCounts.GetValueOrDefault(d.ApplicantAccountId, 1) - 1),
            relationCounts.GetValueOrDefault(d.ApplicantAccountId, 0),
            StatusLabel(d.Status),
            d.DecidedUnitId != null ? unitNamesById.GetValueOrDefault(d.DecidedUnitId.Value) : null))
            .ToList();

        var bytes = sheet.Export($"Demandes {request.ScoutYear}", rows, activeUnitNames);
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

        // Active units by normalized name (accent/case-insensitive) for the Unité column.
        var units = await context.Units.Where(u => u.IsActive).Select(u => new { u.Id, u.Name }).ToListAsync(ct);
        var unitByName = new Dictionary<string, Guid>();
        foreach (var u in units) unitByName[TextNormalization.NormalizeKey(u.Name)] = u.Id;

        var errors = new List<string>();
        int applied = 0, skipped = 0;

        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.Decision)) { skipped++; continue; } // no decision = leave as-is

            if (row.Id is null) { errors.Add($"Ligne {row.RowNumber} : référence manquante ou invalide."); continue; }
            if (!demandes.TryGetValue(row.Id.Value, out var demande))
            { errors.Add($"Ligne {row.RowNumber} : demande introuvable (ou déjà envoyée)."); continue; }

            var dec = TextNormalization.NormalizeKey(row.Decision);
            if (dec.Contains("accept"))
            {
                if (string.IsNullOrWhiteSpace(row.Unit))
                { errors.Add($"Ligne {row.RowNumber} ({demande.FirstName} {demande.LastName}) : unité requise pour une acceptation."); continue; }
                if (!unitByName.TryGetValue(TextNormalization.NormalizeKey(row.Unit), out var unitId))
                { errors.Add($"Ligne {row.RowNumber} : unité introuvable « {row.Unit} »."); continue; }
                demande.Status = DemandeStatus.Approved;
                demande.DecidedUnitId = unitId;
                demande.DecisionNotes = null;
            }
            else if (dec.Contains("refus") || dec.Contains("declin"))
            {
                var reason = row.Reason?.Trim();
                if (!string.IsNullOrEmpty(reason) && (reason.Contains('<') || reason.Contains('>')))
                { errors.Add($"Ligne {row.RowNumber} : le motif ne doit pas contenir < ou >."); continue; }
                if (reason?.Length > 1000) reason = reason[..1000];
                demande.Status = DemandeStatus.Declined;
                demande.DecidedUnitId = null;
                demande.DecisionNotes = reason;
            }
            else
            { errors.Add($"Ligne {row.RowNumber} : décision « {row.Decision} » non reconnue (attendu : Accepté ou Refusé)."); continue; }

            demande.ReviewedByUserId = currentUser.UserId;
            demande.ReviewedAt = DateTime.UtcNow;
            applied++;
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("ImportDecisions", "Demande", null, newValues: new { applied, skipped, errors = errors.Count, request.ScoutYear }, cancellationToken: ct);
        return Result<ImportDemandeDecisionsResult>.Success(new ImportDemandeDecisionsResult(applied, skipped, errors));
    }
}
