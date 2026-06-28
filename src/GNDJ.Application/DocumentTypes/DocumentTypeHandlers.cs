using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.DocumentTypes;

// Admin-managed catalog of document types (what each member must provide). RequiresExpiry forces an
// expiry date on upload; RequiresApproval routes uploads through the Pending→Approved review flow.

// DTOs
public record DocumentTypeDto(Guid Id, string Name, string Code, string? Description, bool RequiresExpiry, bool RequiresApproval, bool IsActive, int DisplayOrder, int DocumentCount, DateTime CreatedAt);
public record DocumentTypeDetailDto(Guid Id, string Name, string Code, string? Description, bool RequiresExpiry, bool RequiresApproval, bool IsActive, int DisplayOrder, DateTime CreatedAt, DateTime UpdatedAt);
public record DocumentTypeListDto(Guid Id, string Name, string Code, bool RequiresExpiry, bool RequiresApproval);

// GetAll (admin — shows all including inactive)
public record GetDocumentTypesQuery(string? Search, int Page = 1, int PageSize = 20) : IRequest<PaginatedList<DocumentTypeDto>>;

public class GetDocumentTypesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetDocumentTypesQuery, PaginatedList<DocumentTypeDto>>
{
    public async ValueTask<PaginatedList<DocumentTypeDto>> Handle(GetDocumentTypesQuery request, CancellationToken ct)
    {
        var query = context.DocumentTypes.AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(dt => dt.Name.ToLower().Contains(search) || dt.Code.ToLower().Contains(search));
        }

        var projected = query.OrderBy(dt => dt.DisplayOrder).ThenBy(dt => dt.Name).Select(dt => new DocumentTypeDto(
            dt.Id, dt.Name, dt.Code, dt.Description, dt.RequiresExpiry, dt.RequiresApproval, dt.IsActive, dt.DisplayOrder,
            dt.Documents.Count(d => !d.IsDeleted),
            dt.CreatedAt
        ));

        return await PaginatedList<DocumentTypeDto>.CreateAsync(projected, request.Page, request.PageSize, ct);
    }
}

// GetById
public record GetDocumentTypeByIdQuery(Guid Id) : IRequest<DocumentTypeDetailDto?>;

public class GetDocumentTypeByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetDocumentTypeByIdQuery, DocumentTypeDetailDto?>
{
    public async ValueTask<DocumentTypeDetailDto?> Handle(GetDocumentTypeByIdQuery request, CancellationToken ct)
    {
        return await context.DocumentTypes
            .Where(dt => dt.Id == request.Id)
            .Select(dt => new DocumentTypeDetailDto(dt.Id, dt.Name, dt.Code, dt.Description, dt.RequiresExpiry, dt.RequiresApproval, dt.IsActive, dt.DisplayOrder, dt.CreatedAt, dt.UpdatedAt))
            .FirstOrDefaultAsync(ct);
    }
}

// GetAll active (for dropdowns and member checklist)
public record GetDocumentTypeListQuery() : IRequest<List<DocumentTypeListDto>>;

public class GetDocumentTypeListQueryHandler(IApplicationDbContext context) : IRequestHandler<GetDocumentTypeListQuery, List<DocumentTypeListDto>>
{
    public async ValueTask<List<DocumentTypeListDto>> Handle(GetDocumentTypeListQuery request, CancellationToken ct)
    {
        return await context.DocumentTypes
            .Where(dt => dt.IsActive)
            .OrderBy(dt => dt.DisplayOrder).ThenBy(dt => dt.Name)
            .Select(dt => new DocumentTypeListDto(dt.Id, dt.Name, dt.Code, dt.RequiresExpiry, dt.RequiresApproval))
            .ToListAsync(ct);
    }
}

// Create
public record CreateDocumentTypeCommand(string Name, string Code, string? Description, bool RequiresExpiry, bool RequiresApproval, bool IsActive, int DisplayOrder) : IRequest<Result<Guid>>;

public class CreateDocumentTypeCommandValidator : AbstractValidator<CreateDocumentTypeCommand>
{
    public CreateDocumentTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
    }
}

public class CreateDocumentTypeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<CreateDocumentTypeCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateDocumentTypeCommand request, CancellationToken ct)
    {
        var codeExists = await context.DocumentTypes.AnyAsync(dt => dt.Code == request.Code, ct);
        if (codeExists)
            return Result<Guid>.Failure("Un type de document avec ce code existe déjà.");

        var entity = new DocumentType
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description,
            RequiresExpiry = request.RequiresExpiry,
            RequiresApproval = request.RequiresApproval,
            IsActive = request.IsActive,
            DisplayOrder = request.DisplayOrder
        };

        context.DocumentTypes.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "DocumentType", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateDocumentTypeCommand(Guid Id, string Name, string Code, string? Description, bool RequiresExpiry, bool RequiresApproval, bool IsActive, int DisplayOrder) : IRequest<Result<bool>>;

public class UpdateDocumentTypeCommandValidator : AbstractValidator<UpdateDocumentTypeCommand>
{
    public UpdateDocumentTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.DisplayOrder).InclusiveBetween(0, 9999);
    }
}

public class UpdateDocumentTypeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateDocumentTypeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateDocumentTypeCommand request, CancellationToken ct)
    {
        var entity = await context.DocumentTypes.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Type de document introuvable.");

        var codeExists = await context.DocumentTypes.AnyAsync(dt => dt.Code == request.Code && dt.Id != request.Id, ct);
        if (codeExists)
            return Result<bool>.Failure("Un type de document avec ce code existe déjà.");

        var oldValues = new { entity.Name, entity.Code, entity.Description, entity.RequiresExpiry, entity.RequiresApproval, entity.IsActive, entity.DisplayOrder };

        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.RequiresExpiry = request.RequiresExpiry;
        entity.RequiresApproval = request.RequiresApproval;
        entity.IsActive = request.IsActive;
        entity.DisplayOrder = request.DisplayOrder;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "DocumentType", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code, entity.IsActive }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Delete
public record DeleteDocumentTypeCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteDocumentTypeCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<DeleteDocumentTypeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteDocumentTypeCommand request, CancellationToken ct)
    {
        var entity = await context.DocumentTypes
            .Include(dt => dt.Documents)
            .FirstOrDefaultAsync(dt => dt.Id == request.Id, ct);

        if (entity is null)
            return Result<bool>.Failure("Type de document introuvable.");

        // Hard-block deletion when documents reference it (no archive fallback here — toggle IsActive to
        // retire a type instead, which keeps existing documents but hides it from the upload matrix).
        if (entity.Documents.Any())
            return Result<bool>.Failure("Impossible de supprimer un type de document utilisé par des documents existants.");

        context.DocumentTypes.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "DocumentType", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
