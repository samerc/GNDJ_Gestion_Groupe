using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// DTOs
public record MemberDocumentDto(
    Guid Id, Guid MemberId, Guid DocumentTypeId, string DocumentTypeName,
    string Title, string FileName, long FileSize, string MimeType,
    string Status, string? ReviewNotes, Guid? ReviewedBy, DateTime? ReviewedAt,
    DateOnly? ExpiryDate, DateOnly? IssuedDate, bool IsExpired, DateTime CreatedAt
);

// Helper: check if user can access a member (same pattern as guardians)
static class DocumentAccessHelper
{
    public static async Task<bool> CanAccessMember(IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        // Allow members to access their own documents
        if (currentUser.MemberId == memberId) return true;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        return await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
    }
}

// Get documents for a member
public record GetMemberDocumentsQuery(Guid MemberId) : IRequest<Result<IReadOnlyList<MemberDocumentDto>>>;

public class GetMemberDocumentsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetMemberDocumentsQuery, Result<IReadOnlyList<MemberDocumentDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberDocumentDto>>> Handle(GetMemberDocumentsQuery request, CancellationToken ct)
    {
        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, request.MemberId, ct))
            return Result<IReadOnlyList<MemberDocumentDto>>.Failure("Accès non autorisé à ce membre.");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var docs = await context.MemberDocuments
            .Where(d => d.MemberId == request.MemberId)
            .Include(d => d.DocumentType)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new MemberDocumentDto(
                d.Id, d.MemberId, d.DocumentTypeId, d.DocumentType.Name,
                d.Title, d.FileName, d.FileSize, d.MimeType,
                d.Status, d.ReviewNotes, d.ReviewedBy, d.ReviewedAt,
                d.ExpiryDate, d.IssuedDate,
                d.ExpiryDate != null && d.ExpiryDate < today,
                d.CreatedAt
            ))
            .ToListAsync(ct);

        return Result<IReadOnlyList<MemberDocumentDto>>.Success(docs);
    }
}

// Upload document (metadata only — the controller already saved the file to disk). Status starts
// Pending when the doc type RequiresApproval, else auto-Approved (stamped reviewed by the uploader).
public record CreateMemberDocumentCommand(
    Guid MemberId, Guid DocumentTypeId, string Title,
    string FilePath, string FileName, long FileSize, string MimeType,
    DateOnly? ExpiryDate, DateOnly? IssuedDate
) : IRequest<Result<Guid>>;

public class CreateMemberDocumentCommandValidator : AbstractValidator<CreateMemberDocumentCommand>
{
    public CreateMemberDocumentCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.DocumentTypeId).NotEmpty().WithMessage("Le type de document est requis.");
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200);
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(300);
        RuleFor(x => x.FilePath).NotEmpty().MaximumLength(500);
        RuleFor(x => x.MimeType).NotEmpty().MaximumLength(100);
    }
}

public class CreateMemberDocumentCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<CreateMemberDocumentCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateMemberDocumentCommand request, CancellationToken ct)
    {
        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, request.MemberId, ct))
            return Result<Guid>.Failure("Accès non autorisé à ce membre.");

        var docType = await context.DocumentTypes.FindAsync([request.DocumentTypeId], ct);
        if (docType is null)
            return Result<Guid>.Failure("Type de document introuvable.");

        if (docType.RequiresExpiry && request.ExpiryDate is null)
            return Result<Guid>.Failure("La date d'expiration est requise pour ce type de document.");

        var status = docType.RequiresApproval ? DocumentStatus.Pending : DocumentStatus.Approved;

        var entity = new MemberDocument
        {
            MemberId = request.MemberId,
            DocumentTypeId = request.DocumentTypeId,
            Title = request.Title,
            FilePath = request.FilePath,
            FileName = request.FileName,
            FileSize = request.FileSize,
            MimeType = request.MimeType,
            Status = status,
            ExpiryDate = request.ExpiryDate,
            IssuedDate = request.IssuedDate,
            // Auto-approve if no approval required
            ReviewedBy = !docType.RequiresApproval ? currentUser.UserId : null,
            ReviewedAt = !docType.RequiresApproval ? DateTime.UtcNow : null
        };

        context.MemberDocuments.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "MemberDocument", entity.Id, newValues: new { entity.Title, entity.FileName, entity.Status }, cancellationToken: ct);

        return Result<Guid>.Success(entity.Id);
    }
}

// Approve / Reject a document (leader review). Status changes are allowed in either direction at any
// time (approve→reject and back); the reviewer + timestamp are stamped on each change.
public record ReviewDocumentCommand(Guid Id, string Status, string? ReviewNotes) : IRequest<Result<bool>>;

public class ReviewDocumentCommandValidator : AbstractValidator<ReviewDocumentCommand>
{
    public ReviewDocumentCommandValidator()
    {
        RuleFor(x => x.Status).Must(s => s == DocumentStatus.Approved || s == DocumentStatus.Rejected)
            .WithMessage("Le statut doit être Approved ou Rejected.");
        RuleFor(x => x.ReviewNotes).MaximumLength(2000);
    }
}

public class ReviewDocumentCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<ReviewDocumentCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReviewDocumentCommand request, CancellationToken ct)
    {
        var entity = await context.MemberDocuments.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Document introuvable.");

        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        var oldStatus = entity.Status;
        entity.Status = request.Status;
        entity.ReviewedBy = currentUser.UserId;
        entity.ReviewedAt = DateTime.UtcNow;
        entity.ReviewNotes = request.ReviewNotes;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "MemberDocument", entity.Id,
            oldValues: new { Status = oldStatus },
            newValues: new { entity.Status, entity.ReviewNotes },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Delete document
public record DeleteMemberDocumentCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMemberDocumentCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<DeleteMemberDocumentCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteMemberDocumentCommand request, CancellationToken ct)
    {
        var entity = await context.MemberDocuments.FindAsync([request.Id], ct);
        if (entity is null)
            return Result<bool>.Failure("Document introuvable.");

        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, entity.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé.");

        context.MemberDocuments.Remove(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "MemberDocument", entity.Id, oldValues: new { entity.Title, entity.FileName }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}

// Resolves the on-disk path for a download. Returns null on missing OR unauthorized (controller 404s)
// — the controller still applies the path-traversal guard before streaming the file.
public record GetDocumentFileQuery(Guid Id) : IRequest<DocumentFileDto?>;
public record DocumentFileDto(string FilePath, string FileName, string MimeType);

public class GetDocumentFileQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetDocumentFileQuery, DocumentFileDto?>
{
    public async ValueTask<DocumentFileDto?> Handle(GetDocumentFileQuery request, CancellationToken ct)
    {
        var doc = await context.MemberDocuments.FindAsync([request.Id], ct);
        if (doc is null) return null;

        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, doc.MemberId, ct))
            return null;

        return new DocumentFileDto(doc.FilePath, doc.FileName, doc.MimeType);
    }
}

// Unit documents matrix (CU page: all active members × active doc types + the year's cotisation cell).
// Queries are projected to slim records (no full entities) since this is the heaviest per-page load.
public record GetUnitDocumentsMatrixQuery(Guid UnitId, string ScoutYear) : IRequest<Result<UnitDocumentsMatrixDto>>;

public record UnitDocumentsMatrixDto(
    IReadOnlyList<DocTypeColumnDto> DocTypes,
    IReadOnlyList<MemberDocRowDto> Members
);

public record DocTypeColumnDto(Guid Id, string Name, string Code, bool RequiresExpiry, bool RequiresApproval);

public record MemberDocRowDto(
    Guid MemberId, string FirstName, string LastName, string? TeamName,
    IReadOnlyList<MemberDocCellDto> Documents,
    MemberCotisationCellDto Cotisation
);

public record CotisationPaymentCellDto(decimal Amount, string Currency, string PaymentMethod);

public record MemberCotisationCellDto(
    Guid? CotisationId,
    string? ReceiptNumber,
    DateOnly? PaymentDate,
    bool WillNotPay,
    List<CotisationPaymentCellDto> Payments
);

public record MemberDocCellDto(
    Guid DocTypeId,
    Guid? DocumentId,
    string? FileName,
    string? MimeType,
    string? Status,
    string? ReviewNotes,
    DateOnly? ExpiryDate,
    bool IsExpired,
    DateTime? CreatedAt
);

public class GetUnitDocumentsMatrixQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetUnitDocumentsMatrixQuery, Result<UnitDocumentsMatrixDto>>
{
    public async ValueTask<Result<UnitDocumentsMatrixDto>> Handle(GetUnitDocumentsMatrixQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<UnitDocumentsMatrixDto>.Failure("Accès non autorisé à cette unité.");

        // Active doc types
        var docTypes = await context.DocumentTypes
            .Where(dt => dt.IsActive)
            .OrderBy(dt => dt.DisplayOrder).ThenBy(dt => dt.Name)
            .Select(dt => new DocTypeColumnDto(dt.Id, dt.Name, dt.Code, dt.RequiresExpiry, dt.RequiresApproval))
            .ToListAsync(ct);

        var docTypeIds = docTypes.Select(dt => dt.Id).ToList();

        // Active members in this unit (project only the fields the matrix needs — no full entities)
        var memberAssignments = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null)
            .OrderBy(a => a.Team != null ? a.Team.Name : "zzz")
            .ThenBy(a => a.Member.LastName)
            .ThenBy(a => a.Member.FirstName)
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, TeamName = a.Team != null ? a.Team.Name : null })
            .ToListAsync(ct);

        var memberIds = memberAssignments.Select(a => a.MemberId).Distinct().ToList();

        // All documents for these members and active doc types (project only the cell fields)
        var allDocs = await context.MemberDocuments
            .Where(d => memberIds.Contains(d.MemberId) && docTypeIds.Contains(d.DocumentTypeId))
            .Select(d => new { d.Id, d.MemberId, d.DocumentTypeId, d.FileName, d.MimeType, d.Status, d.ReviewNotes, d.ExpiryDate, d.CreatedAt })
            .ToListAsync(ct);

        // Cotisations for this scout year
        var allCotisations = await context.MemberCotisations
            .Where(c => memberIds.Contains(c.MemberId) && c.ScoutYear == request.ScoutYear)
            .Include(c => c.Payments.Where(p => !p.IsDeleted))
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Build matrix
        var rows = memberAssignments
            .GroupBy(a => a.MemberId)
            .Select(g =>
            {
                var first = g.First();
                var memberDocs = allDocs.Where(d => d.MemberId == g.Key).ToList();

                var cells = docTypes.Select(dt =>
                {
                    // One cell per doc type → the most recently uploaded document of that type (or empty).
                    var doc = memberDocs
                        .Where(d => d.DocumentTypeId == dt.Id)
                        .OrderByDescending(d => d.CreatedAt)
                        .FirstOrDefault();

                    return new MemberDocCellDto(
                        dt.Id,
                        doc?.Id,
                        doc?.FileName,
                        doc?.MimeType,
                        doc?.Status,
                        doc?.ReviewNotes,
                        doc?.ExpiryDate,
                        doc?.ExpiryDate != null && doc.ExpiryDate < today,
                        doc?.CreatedAt
                    );
                }).ToList();

                var cot = allCotisations.FirstOrDefault(c => c.MemberId == g.Key);
                var cotCell = new MemberCotisationCellDto(
                    cot?.Id, cot?.ReceiptNumber, cot?.PaymentDate, cot?.WillNotPay ?? false,
                    cot?.Payments.Select(p => new CotisationPaymentCellDto(p.Amount, p.Currency, p.PaymentMethod)).ToList() ?? []
                );

                return new MemberDocRowDto(
                    g.Key,
                    first.FirstName,
                    first.LastName,
                    first.TeamName,
                    cells,
                    cotCell
                );
            }).ToList();

        return Result<UnitDocumentsMatrixDto>.Success(new UnitDocumentsMatrixDto(docTypes, rows));
    }
}

// Lists a unit's document files for zip download (optionally filtered to one doc type). The controller
// builds the archive (member-name folders) and re-checks each path against the uploads root.
public record GetUnitDocumentFilesQuery(Guid UnitId, Guid? DocTypeId = null) : IRequest<Result<IReadOnlyList<ZipDocumentDto>>>;

public record ZipDocumentDto(string MemberName, string DocTypeName, string FileName, string FilePath);

public class GetUnitDocumentFilesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetUnitDocumentFilesQuery, Result<IReadOnlyList<ZipDocumentDto>>>
{
    public async ValueTask<Result<IReadOnlyList<ZipDocumentDto>>> Handle(GetUnitDocumentFilesQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<IReadOnlyList<ZipDocumentDto>>.Failure("Accès non autorisé.");

        var memberIds = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null)
            .Select(a => a.MemberId)
            .Distinct()
            .ToListAsync(ct);

        var query = context.MemberDocuments
            .Where(d => memberIds.Contains(d.MemberId));

        if (request.DocTypeId.HasValue)
            query = query.Where(d => d.DocumentTypeId == request.DocTypeId.Value);

        return Result<IReadOnlyList<ZipDocumentDto>>.Success(
            await query
                .OrderBy(d => d.Member.LastName).ThenBy(d => d.Member.FirstName)
                .Select(d => new ZipDocumentDto(
                    d.Member.FirstName + " " + d.Member.LastName,
                    d.DocumentType.Name,
                    d.FileName,
                    d.FilePath
                ))
                .ToListAsync(ct)
        );
    }
}

// Dashboard: approved documents expiring within DaysAhead (or already expired). Unit-scoped for non-admins.
public record GetExpiringDocumentsQuery(int DaysAhead = 30) : IRequest<IReadOnlyList<ExpiringDocumentDto>>;
public record ExpiringDocumentDto(Guid DocumentId, Guid MemberId, string MemberName, string DocumentTypeName, string Title, DateOnly ExpiryDate, bool IsExpired);

public class GetExpiringDocumentsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetExpiringDocumentsQuery, IReadOnlyList<ExpiringDocumentDto>>
{
    public async ValueTask<IReadOnlyList<ExpiringDocumentDto>> Handle(GetExpiringDocumentsQuery request, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var cutoff = today.AddDays(request.DaysAhead);

        var query = context.MemberDocuments
            .Where(d => d.ExpiryDate != null && d.ExpiryDate <= cutoff && d.Status == DocumentStatus.Approved);

        // Unit-scope for non-super-admins
        if (!currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            query = query.Where(d => context.MemberAssignments.Any(a =>
                a.MemberId == d.MemberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId)));
        }

        return await query
            .OrderBy(d => d.ExpiryDate)
            .Select(d => new ExpiringDocumentDto(
                d.Id, d.MemberId, d.Member.FirstName + " " + d.Member.LastName,
                d.DocumentType.Name, d.Title, d.ExpiryDate!.Value, d.ExpiryDate < today
            ))
            .ToListAsync(ct);
    }
}
