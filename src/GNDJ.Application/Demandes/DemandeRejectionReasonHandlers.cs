using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// Managed list of demande REJECTION REASONS (stored as the JSON setting demande.rejection_reasons, CG-editable).
// Each reason has a short CODE the Maîtrise types in the Excel Décision column (or picks in the web decline
// dialog); resolving a code yields the reason TEXT which is stored on the demande as DecisionNotes and emailed
// as {{reason}} by the single demande_declined template — so the whole decline email pipeline is unchanged, we
// only add a code→text lookup. Exactly one reason may be the default; the literal "--" (or "-") in the Décision
// column is a shorthand that always maps to that default reason (e.g. "Refus par faute de place").
public record DemandeRejectionReasonDto(string Code, string Label, string Text, bool IsDefault);

public static class DemandeRejectionReasons
{
    public const string SettingKey = "demande.rejection_reasons";

    public static List<DemandeRejectionReasonDto> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return System.Text.Json.JsonSerializer.Deserialize<List<DemandeRejectionReasonDto>>(json) ?? []; }
        catch { return []; }
    }

    public static string Serialize(IEnumerable<DemandeRejectionReasonDto> items) =>
        System.Text.Json.JsonSerializer.Serialize(items
            .Where(r => !string.IsNullOrWhiteSpace(r.Code))
            .Select(r => new DemandeRejectionReasonDto(r.Code.Trim(), r.Label.Trim(), (r.Text ?? "").Trim(), r.IsDefault))
            .ToList());

    // Resolve a typed Décision-cell code to a reason. "--"/"-" → the default reason; otherwise a code match
    // (accent/case-insensitive). Returns null when nothing matches (import reports it as an unknown code).
    public static DemandeRejectionReasonDto? Resolve(IReadOnlyList<DemandeRejectionReasonDto> reasons, string code)
    {
        var c = (code ?? "").Trim();
        if (c is "--" or "-") return reasons.FirstOrDefault(r => r.IsDefault);
        var norm = TextNormalization.NormalizeKey(c);
        return reasons.FirstOrDefault(r => TextNormalization.NormalizeKey(r.Code) == norm);
    }

    // The text emailed as {{reason}} — falls back to the short label when no long text is set.
    public static string TextOf(DemandeRejectionReasonDto r) => string.IsNullOrWhiteSpace(r.Text) ? r.Label : r.Text;
}

// ── Read ──────────────────────────────────────────────────────────────────────────────────────────────────
public record GetDemandeRejectionReasonsQuery : IRequest<Result<IReadOnlyList<DemandeRejectionReasonDto>>>;

public class GetDemandeRejectionReasonsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetDemandeRejectionReasonsQuery, Result<IReadOnlyList<DemandeRejectionReasonDto>>>
{
    public async ValueTask<Result<IReadOnlyList<DemandeRejectionReasonDto>>> Handle(GetDemandeRejectionReasonsQuery request, CancellationToken ct)
    {
        var json = await context.Settings.Where(s => s.Key == DemandeRejectionReasons.SettingKey)
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        return Result<IReadOnlyList<DemandeRejectionReasonDto>>.Success(DemandeRejectionReasons.Parse(json));
    }
}

// ── Write (replace the whole list) ────────────────────────────────────────────────────────────────────────
public record UpdateDemandeRejectionReasonsCommand(IReadOnlyList<DemandeRejectionReasonDto> Reasons) : IRequest<Result<bool>>;

public class UpdateDemandeRejectionReasonsCommandValidator : AbstractValidator<UpdateDemandeRejectionReasonsCommand>
{
    public UpdateDemandeRejectionReasonsCommandValidator()
    {
        RuleFor(x => x.Reasons).NotNull().Must(r => r.Count <= 100).WithMessage("Trop de motifs (max 100).");
        RuleForEach(x => x.Reasons).ChildRules(r =>
        {
            r.RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(30).NoHtml()
                // null/empty is already reported by NotEmpty; guard here so the analyzer knows Trim() is safe.
                .Must(c => c is null || c.Trim() is not ("--" or "-")).WithMessage("Le code « -- » est réservé (motif par défaut).");
            r.RuleFor(x => x.Label).NotEmpty().WithMessage("Le libellé est requis.").MaximumLength(150).NoHtml();
            r.RuleFor(x => x.Text).MaximumLength(1000).NoHtml();
        });
        // Codes must be unique (accent/case-insensitive), and at most one default.
        RuleFor(x => x.Reasons).Must(rs =>
                rs.Select(r => TextNormalization.NormalizeKey(r.Code ?? "")).Distinct().Count() == rs.Count)
            .WithMessage("Les codes doivent être uniques.")
            .Must(rs => rs.Count(r => r.IsDefault) <= 1).WithMessage("Un seul motif peut être défini par défaut.");
    }
}

public class UpdateDemandeRejectionReasonsCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<UpdateDemandeRejectionReasonsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateDemandeRejectionReasonsCommand request, CancellationToken ct)
    {
        var value = DemandeRejectionReasons.Serialize(request.Reasons);
        var setting = await context.Settings.FirstOrDefaultAsync(s => s.Key == DemandeRejectionReasons.SettingKey, ct);
        if (setting is null)
            context.Settings.Add(new Setting { Key = DemandeRejectionReasons.SettingKey, Value = value, Category = "demande", Label = "Motifs de refus", ValueType = "json_array" });
        else
            setting.Value = value;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("UpdateRejectionReasons", "Demande", null, newValues: new { count = request.Reasons.Count }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
