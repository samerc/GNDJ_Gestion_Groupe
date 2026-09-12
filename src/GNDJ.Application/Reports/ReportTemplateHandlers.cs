using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// Saved report presets: the CG defines a named template (report type + format + chosen columns) once,
// and a CU then generates roster/export reports from it without re-picking columns. CRUD only here;
// ColumnsJson is the serialized column selection consumed by the roster/export generators.

// DTOs — carries the full definition (columns + targeting scope + filter + title override).
public record ReportTemplateDto(
    Guid Id, string Name, string Description, string ReportType, string Format,
    string ColumnsJson, bool IsActive, int DisplayOrder, DateTime CreatedAt,
    string ScopeType, Guid? ScopeUnitTypeId, string ScopeUnitIdsJson, string? TitleOverride, string MemberFilter
);

// Allowed value sets, shared by the create + update validators.
file static class ReportTemplateRules
{
    public static readonly string[] ReportTypes = ["roster", "export"];
    public static readonly string[] Formats = ["pdf", "excel", "xlsx", "csv"]; // xlsx kept for legacy rows
    public static readonly string[] ScopeTypes = ["unit", "units", "branch", "group"];
    public static readonly string[] MemberFilters = ["all", "youth", "maitrise"];
}

// List all templates (for admin + CU)
public record GetReportTemplatesQuery(bool ActiveOnly = false) : IRequest<IReadOnlyList<ReportTemplateDto>>;

public class GetReportTemplatesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetReportTemplatesQuery, IReadOnlyList<ReportTemplateDto>>
{
    public async ValueTask<IReadOnlyList<ReportTemplateDto>> Handle(GetReportTemplatesQuery request, CancellationToken ct)
    {
        var query = context.ReportTemplates.AsQueryable();
        if (request.ActiveOnly)
            query = query.Where(t => t.IsActive);

        return await query
            .OrderBy(t => t.DisplayOrder)
            .Select(t => new ReportTemplateDto(
                t.Id, t.Name, t.Description, t.ReportType, t.Format,
                t.ColumnsJson, t.IsActive, t.DisplayOrder, t.CreatedAt,
                t.ScopeType, t.ScopeUnitTypeId, t.ScopeUnitIdsJson, t.TitleOverride, t.MemberFilter
            ))
            .ToListAsync(ct);
    }
}

// Create
public record CreateReportTemplateCommand(
    string Name, string? Description, string ReportType, string Format,
    string ColumnsJson, bool IsActive, int DisplayOrder,
    string ScopeType, Guid? ScopeUnitTypeId, string? ScopeUnitIdsJson, string? TitleOverride, string? MemberFilter
) : IRequest<Result<Guid>>;

public class CreateReportTemplateCommandValidator : AbstractValidator<CreateReportTemplateCommand>
{
    public CreateReportTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.ReportType).NotEmpty().Must(t => ReportTemplateRules.ReportTypes.Contains(t)).WithMessage("Type invalide.");
        RuleFor(x => x.Format).NotEmpty().Must(f => ReportTemplateRules.Formats.Contains(f)).WithMessage("Format invalide.");
        RuleFor(x => x.ColumnsJson).NotEmpty().WithMessage("Les colonnes sont requises.").MaximumLength(5000);
        RuleFor(x => x.ScopeType).NotEmpty().Must(s => ReportTemplateRules.ScopeTypes.Contains(s)).WithMessage("Cible invalide.");
        RuleFor(x => x.ScopeUnitTypeId).NotEmpty().When(x => x.ScopeType == "branch").WithMessage("Choisissez une branche.");
        RuleFor(x => x.MemberFilter).Must(m => m == null || ReportTemplateRules.MemberFilters.Contains(m)).WithMessage("Filtre invalide.");
        RuleFor(x => x.TitleOverride).MaximumLength(200);
    }
}

public class CreateReportTemplateCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateReportTemplateCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateReportTemplateCommand request, CancellationToken ct)
    {
        var entity = new ReportTemplate
        {
            Name = request.Name,
            Description = request.Description ?? string.Empty,
            ReportType = request.ReportType,
            Format = request.Format,
            ColumnsJson = request.ColumnsJson,
            IsActive = request.IsActive,
            DisplayOrder = request.DisplayOrder,
            ScopeType = request.ScopeType,
            ScopeUnitTypeId = request.ScopeUnitTypeId,
            ScopeUnitIdsJson = string.IsNullOrWhiteSpace(request.ScopeUnitIdsJson) ? "[]" : request.ScopeUnitIdsJson,
            TitleOverride = string.IsNullOrWhiteSpace(request.TitleOverride) ? null : request.TitleOverride,
            MemberFilter = request.MemberFilter ?? "all"
        };

        context.ReportTemplates.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateReportTemplateCommand(
    Guid Id, string Name, string? Description, string ReportType, string Format,
    string ColumnsJson, bool IsActive, int DisplayOrder,
    string ScopeType, Guid? ScopeUnitTypeId, string? ScopeUnitIdsJson, string? TitleOverride, string? MemberFilter
) : IRequest<Result<bool>>;

public class UpdateReportTemplateCommandValidator : AbstractValidator<UpdateReportTemplateCommand>
{
    public UpdateReportTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.ReportType).NotEmpty().Must(t => ReportTemplateRules.ReportTypes.Contains(t)).WithMessage("Type invalide.");
        RuleFor(x => x.Format).NotEmpty().Must(f => ReportTemplateRules.Formats.Contains(f)).WithMessage("Format invalide.");
        RuleFor(x => x.ColumnsJson).NotEmpty().WithMessage("Les colonnes sont requises.").MaximumLength(5000);
        RuleFor(x => x.ScopeType).NotEmpty().Must(s => ReportTemplateRules.ScopeTypes.Contains(s)).WithMessage("Cible invalide.");
        RuleFor(x => x.ScopeUnitTypeId).NotEmpty().When(x => x.ScopeType == "branch").WithMessage("Choisissez une branche.");
        RuleFor(x => x.MemberFilter).Must(m => m == null || ReportTemplateRules.MemberFilters.Contains(m)).WithMessage("Filtre invalide.");
        RuleFor(x => x.TitleOverride).MaximumLength(200);
    }
}

public class UpdateReportTemplateCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateReportTemplateCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateReportTemplateCommand request, CancellationToken ct)
    {
        var entity = await context.ReportTemplates.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Modèle introuvable.");

        entity.Name = request.Name;
        entity.Description = request.Description ?? string.Empty;
        entity.ReportType = request.ReportType;
        entity.Format = request.Format;
        entity.ColumnsJson = request.ColumnsJson;
        entity.IsActive = request.IsActive;
        entity.DisplayOrder = request.DisplayOrder;
        entity.ScopeType = request.ScopeType;
        entity.ScopeUnitTypeId = request.ScopeUnitTypeId;
        entity.ScopeUnitIdsJson = string.IsNullOrWhiteSpace(request.ScopeUnitIdsJson) ? "[]" : request.ScopeUnitIdsJson;
        entity.TitleOverride = string.IsNullOrWhiteSpace(request.TitleOverride) ? null : request.TitleOverride;
        entity.MemberFilter = request.MemberFilter ?? "all";

        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteReportTemplateCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteReportTemplateCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteReportTemplateCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteReportTemplateCommand request, CancellationToken ct)
    {
        var entity = await context.ReportTemplates.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Modèle introuvable.");

        context.ReportTemplates.Remove(entity);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Generate a report FROM a template: resolve the template's scope → target units, then run the roster/export
// generator across them. `UnitId` is only used for a unit-scoped template (the CU/CG picks which unit).
public record ReportFileResult(byte[] Data, string ContentType, string FileName);

public record GenerateReportFromTemplateQuery(Guid TemplateId, string ScoutYear, Guid? UnitId)
    : IRequest<Result<ReportFileResult>>;

public class GenerateReportFromTemplateQueryHandler(
    IApplicationDbContext context, IMediator mediator)
    : IRequestHandler<GenerateReportFromTemplateQuery, Result<ReportFileResult>>
{
    public async ValueTask<Result<ReportFileResult>> Handle(GenerateReportFromTemplateQuery request, CancellationToken ct)
    {
        var t = await context.ReportTemplates.FindAsync([request.TemplateId], ct);
        if (t is null) return Result<ReportFileResult>.Failure("Modèle introuvable.");

        // Resolve the target units from the scope. Any leader may generate any scope — the data collector then
        // FILTERS the resolved units to the ones the caller actually leads (a CG has all units; a CU gets only
        // theirs), so a CU running a branch/group report simply gets their own units' members.
        List<Guid> unitIds;
        switch (t.ScopeType)
        {
            case "group":
                unitIds = await context.Units.Where(u => u.IsActive).Select(u => u.Id).ToListAsync(ct);
                break;
            case "branch":
                if (t.ScopeUnitTypeId is null) return Result<ReportFileResult>.Failure("Aucune branche définie.");
                unitIds = await context.Units.Where(u => u.IsActive && u.UnitTypeId == t.ScopeUnitTypeId).Select(u => u.Id).ToListAsync(ct);
                break;
            case "units":
                unitIds = ParseGuids(t.ScopeUnitIdsJson);
                break;
            default: // unit
                if (request.UnitId is null || request.UnitId == Guid.Empty)
                    return Result<ReportFileResult>.Failure("Choisissez une unité.");
                unitIds = [request.UnitId.Value];
                break;
        }
        if (unitIds.Count == 0) return Result<ReportFileResult>.Failure("Aucune unité pour ce rapport.");

        var columns = ParseStrings(t.ColumnsJson);
        if (columns.Count == 0) return Result<ReportFileResult>.Failure("Aucune colonne définie.");

        if (t.ReportType == "roster")
        {
            var r = await mediator.Send(new GenerateRosterQuery(
                unitIds[0], null, request.ScoutYear, columns, unitIds, t.TitleOverride ?? t.Name, t.MemberFilter), ct);
            if (!r.IsSuccess) return Result<ReportFileResult>.Failure(r.Error!);
            return Result<ReportFileResult>.Success(new ReportFileResult(r.Value!, "application/pdf", $"{FileName(t.TitleOverride ?? t.Name)}.pdf"));
        }
        else
        {
            var format = t.Format == "csv" ? "csv" : "excel"; // legacy rows may store "xlsx" → treat as excel
            var r = await mediator.Send(new GenerateExportQuery(
                unitIds[0], null, request.ScoutYear, columns, format, unitIds, t.TitleOverride ?? t.Name, t.MemberFilter), ct);
            if (!r.IsSuccess) return Result<ReportFileResult>.Failure(r.Error!);
            return Result<ReportFileResult>.Success(new ReportFileResult(r.Value!.Data, r.Value.ContentType, r.Value.FileName));
        }
    }

    // Defensive JSON parsers — a malformed ColumnsJson/ScopeUnitIdsJson row must not 500 the generator.
    private static List<Guid> ParseGuids(string json)
    {
        try { return JsonSerializer.Deserialize<List<Guid>>(json) ?? []; }
        catch { return []; }
    }
    private static List<string> ParseStrings(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; }
        catch { return []; }
    }
    private static string FileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return string.Concat(name.Select(c => invalid.Contains(c) ? '_' : c)).Replace(" ", "_");
    }
}
