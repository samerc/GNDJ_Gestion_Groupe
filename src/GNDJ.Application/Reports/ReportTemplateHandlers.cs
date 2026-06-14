using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// DTOs
public record ReportTemplateDto(
    Guid Id, string Name, string Description, string ReportType, string Format,
    string ColumnsJson, bool IsActive, int DisplayOrder, DateTime CreatedAt
);

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
                t.ColumnsJson, t.IsActive, t.DisplayOrder, t.CreatedAt
            ))
            .ToListAsync(ct);
    }
}

// Create
public record CreateReportTemplateCommand(
    string Name, string? Description, string ReportType, string Format,
    string ColumnsJson, bool IsActive, int DisplayOrder
) : IRequest<Result<Guid>>;

public class CreateReportTemplateCommandValidator : AbstractValidator<CreateReportTemplateCommand>
{
    public CreateReportTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.ReportType).NotEmpty().Must(t => t is "roster" or "export").WithMessage("Type invalide.");
        RuleFor(x => x.Format).NotEmpty().Must(f => f is "pdf" or "xlsx" or "csv").WithMessage("Format invalide.");
        RuleFor(x => x.ColumnsJson).NotEmpty().WithMessage("Les colonnes sont requises.").MaximumLength(5000);
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
            DisplayOrder = request.DisplayOrder
        };

        context.ReportTemplates.Add(entity);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateReportTemplateCommand(
    Guid Id, string Name, string? Description, string ReportType, string Format,
    string ColumnsJson, bool IsActive, int DisplayOrder
) : IRequest<Result<bool>>;

public class UpdateReportTemplateCommandValidator : AbstractValidator<UpdateReportTemplateCommand>
{
    public UpdateReportTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.ReportType).NotEmpty().Must(t => t is "roster" or "export").WithMessage("Type invalide.");
        RuleFor(x => x.Format).NotEmpty().Must(f => f is "pdf" or "xlsx" or "csv").WithMessage("Format invalide.");
        RuleFor(x => x.ColumnsJson).NotEmpty().WithMessage("Les colonnes sont requises.").MaximumLength(5000);
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
