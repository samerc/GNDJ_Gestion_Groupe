using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// DTOs
// A single file of a document. IsPrimary = page 1 (the inline file on MemberDocument, downloaded via
// /documents/{docId}/download); otherwise a child page (downloaded via /documents/pages/{pageId}/download).
public record DocumentPageDto(Guid? PageId, int Order, string FileName, string MimeType, long FileSize, bool IsPrimary);

public record MemberDocumentDto(
    Guid Id, Guid MemberId, Guid DocumentTypeId, string DocumentTypeName,
    string Title, string FileName, long FileSize, string MimeType,
    string Status, string? ReviewNotes, Guid? ReviewedBy, DateTime? ReviewedAt,
    DateOnly? ExpiryDate, DateOnly? IssuedDate, bool IsExpired, DateTime CreatedAt,
    IReadOnlyList<DocumentPageDto> Pages   // all files of the document: page 1 (inline) + any extra pages
);

// A file saved to disk by the controller, ready to be recorded (inline page 1 or an extra page).
public record SavedDocFile(string FilePath, string FileName, long FileSize, string MimeType);

// Builds the ordered page list of a document = the inline file (page 1) + child pages (2, 3, …).
static class DocumentPageMapper
{
    public static IReadOnlyList<DocumentPageDto> Build(MemberDocument d)
    {
        var pages = new List<DocumentPageDto> { new(null, 1, d.FileName, d.MimeType, d.FileSize, true) };
        pages.AddRange(d.Pages.OrderBy(p => p.PageOrder)
            .Select(p => new DocumentPageDto(p.Id, p.PageOrder, p.FileName, p.MimeType, p.FileSize, false)));
        return pages;
    }

    // Inserts extra pages onto a document by id (page 1 is the inline file, so extra pages start at 2). Adds the
    // page rows directly — never loads/mutates the parent — so SaveChanges only issues INSERTs.
    public static async Task AppendPagesAsync(IApplicationDbContext context, Guid documentId, IReadOnlyList<SavedDocFile> files, DateTime now, CancellationToken ct)
    {
        var maxOrder = await context.MemberDocumentPages
            .Where(p => p.MemberDocumentId == documentId)
            .Select(p => (int?)p.PageOrder).MaxAsync(ct) ?? 1;
        var order = maxOrder + 1;
        foreach (var f in files)
            context.MemberDocumentPages.Add(new MemberDocumentPage { MemberDocumentId = documentId, FilePath = f.FilePath, FileName = f.FileName, FileSize = f.FileSize, MimeType = f.MimeType, PageOrder = order++, CreatedAt = now });
        await context.SaveChangesAsync(ct);
    }
}

// Helper: check if the caller may access a given member's documents. Thin wrappers over the shared
// MemberAccess policy (kept for call-site readability).
static class DocumentAccessHelper
{
    public static Task<bool> CanAccessMember(IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
        => MemberAccess.CanAccessMemberAsync(context, currentUser, memberId, ct);

    // Leader-level access to a whole unit's document views (compliance matrix / zip export).
    public static bool IsUnitLeaderFor(ICurrentUserService currentUser, Guid unitId)
        => MemberAccess.CanLeadUnit(currentUser, unitId);
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
        // Materialize with the child pages, then map in memory (the page list is assembled from the inline
        // file + child rows, which EF can't build inside a single projection).
        var docs = await context.MemberDocuments
            .Where(d => d.MemberId == request.MemberId)
            .Include(d => d.DocumentType)
            .Include(d => d.Pages)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        var result = docs.Select(d => new MemberDocumentDto(
            d.Id, d.MemberId, d.DocumentTypeId, d.DocumentType.Name,
            d.Title, d.FileName, d.FileSize, d.MimeType,
            d.Status, d.ReviewNotes, d.ReviewedBy, d.ReviewedAt,
            d.ExpiryDate, d.IssuedDate,
            d.ExpiryDate != null && d.ExpiryDate < today,
            d.CreatedAt,
            DocumentPageMapper.Build(d)
        )).ToList();

        return Result<IReadOnlyList<MemberDocumentDto>>.Success(result);
    }
}

// Upload one or more files as a document (metadata only — the controller already saved the files to disk).
// A document can hold several files (page 1 = the inline file, pages 2+ = child rows), so an ID card front +
// back, or a multi-page scan, is ONE reviewable document. Behaviour:
//   • If a still-PENDING document of the same (member, type) exists, the new files are APPENDED to it as extra
//     pages (so "upload front" then "upload back" build one document, and re-sending doesn't create duplicates).
//   • Otherwise a new document is created from the first file, with any remaining files as extra pages.
// Status starts Pending when the type RequiresApproval, else auto-Approved (stamped reviewed by the uploader).
public record UploadMemberDocumentCommand(
    Guid MemberId, Guid DocumentTypeId, string Title,
    DateOnly? ExpiryDate, DateOnly? IssuedDate, IReadOnlyList<SavedDocFile> Files
) : IRequest<Result<Guid>>;

public class UploadMemberDocumentCommandValidator : AbstractValidator<UploadMemberDocumentCommand>
{
    public UploadMemberDocumentCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.DocumentTypeId).NotEmpty().WithMessage("Le type de document est requis.");
        RuleFor(x => x.Title).NotEmpty().WithMessage("Le titre est requis.").MaximumLength(200);
        RuleFor(x => x.Files).NotEmpty().WithMessage("Aucun fichier n'a été fourni.");
    }
}

public class UploadMemberDocumentCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<UploadMemberDocumentCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(UploadMemberDocumentCommand request, CancellationToken ct)
    {
        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, request.MemberId, ct))
            return Result<Guid>.Failure("Accès non autorisé à ce membre.");

        var docType = await context.DocumentTypes.FindAsync([request.DocumentTypeId], ct);
        if (docType is null)
            return Result<Guid>.Failure("Type de document introuvable.");

        if (docType.RequiresExpiry && request.ExpiryDate is null)
            return Result<Guid>.Failure("La date d'expiration est requise pour ce type de document.");

        var files = request.Files;
        var now = DateTime.UtcNow;

        // Append to an in-progress (Pending) document of the same type if one exists — front/back land together.
        // Insert the pages directly (don't load/mutate the tracked parent + its collection) so SaveChanges only
        // does INSERTs and never issues a spurious parent UPDATE.
        var existingId = await context.MemberDocuments
            .Where(d => d.MemberId == request.MemberId && d.DocumentTypeId == request.DocumentTypeId && d.Status == DocumentStatus.Pending)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(ct);

        if (existingId is Guid docId)
        {
            await DocumentPageMapper.AppendPagesAsync(context, docId, files, now, ct);
            await auditService.LogAsync("AddPages", "MemberDocument", docId, newValues: new { added = files.Count }, cancellationToken: ct);
            return Result<Guid>.Success(docId);
        }

        var status = docType.RequiresApproval ? DocumentStatus.Pending : DocumentStatus.Approved;
        var first = files[0];
        var entity = new MemberDocument
        {
            MemberId = request.MemberId,
            DocumentTypeId = request.DocumentTypeId,
            Title = request.Title,
            FilePath = first.FilePath,
            FileName = first.FileName,
            FileSize = first.FileSize,
            MimeType = first.MimeType,
            Status = status,
            ExpiryDate = request.ExpiryDate,
            IssuedDate = request.IssuedDate,
            // Auto-approve if no approval required
            ReviewedBy = !docType.RequiresApproval ? currentUser.UserId : null,
            ReviewedAt = !docType.RequiresApproval ? now : null
        };
        // Remaining files become extra pages (2, 3, …).
        var order = 2;
        foreach (var f in files.Skip(1))
            entity.Pages.Add(new MemberDocumentPage { FilePath = f.FilePath, FileName = f.FileName, FileSize = f.FileSize, MimeType = f.MimeType, PageOrder = order++, CreatedAt = now });

        context.MemberDocuments.Add(entity);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "MemberDocument", entity.Id, newValues: new { entity.Title, entity.FileName, entity.Status, pages = files.Count }, cancellationToken: ct);

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

// ── Extra pages of a document (files beyond page 1) ──────────────────────────
// Append already-saved files as extra pages to a specific document (the "Ajouter une page" action). Same
// own/leader access rule as the document's member; adding a page re-opens a Rejected document for review.
public record AddDocumentPagesCommand(Guid DocumentId, IReadOnlyList<SavedDocFile> Files) : IRequest<Result<Guid>>;

public class AddDocumentPagesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<AddDocumentPagesCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(AddDocumentPagesCommand request, CancellationToken ct)
    {
        if (request.Files.Count == 0) return Result<Guid>.Failure("Aucun fichier n'a été fourni.");
        // Load only what we need (no tracked parent to mutate).
        var doc = await context.MemberDocuments
            .Where(d => d.Id == request.DocumentId)
            .Select(d => new { d.Id, d.MemberId, d.Status })
            .FirstOrDefaultAsync(ct);
        if (doc is null) return Result<Guid>.Failure("Document introuvable.");
        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, doc.MemberId, ct))
            return Result<Guid>.Failure("Accès non autorisé.");

        await DocumentPageMapper.AppendPagesAsync(context, doc.Id, request.Files, DateTime.UtcNow, ct);

        // Adding a page to a rejected document re-opens it for review (targeted update, no tracking needed).
        if (doc.Status == DocumentStatus.Rejected)
            await context.MemberDocuments.Where(d => d.Id == doc.Id)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.Status, DocumentStatus.Pending)
                    .SetProperty(x => x.ReviewNotes, (string?)null)
                    .SetProperty(x => x.ReviewedAt, (DateTime?)null)
                    .SetProperty(x => x.ReviewedBy, (Guid?)null), ct);

        await auditService.LogAsync("AddPages", "MemberDocument", doc.Id, newValues: new { added = request.Files.Count }, cancellationToken: ct);
        return Result<Guid>.Success(doc.Id);
    }
}

// Delete one extra page (documents.delete gated at the controller). Page 1 is removed by deleting the whole
// document. Returns the file path so the controller can remove the file from disk (this is a hard delete).
public record DeleteDocumentPageCommand(Guid PageId) : IRequest<Result<PageFileRef>>;
public record PageFileRef(string FilePath);

public class DeleteDocumentPageCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService auditService) : IRequestHandler<DeleteDocumentPageCommand, Result<PageFileRef>>
{
    public async ValueTask<Result<PageFileRef>> Handle(DeleteDocumentPageCommand request, CancellationToken ct)
    {
        var page = await context.MemberDocumentPages.Include(p => p.MemberDocument).FirstOrDefaultAsync(p => p.Id == request.PageId, ct);
        if (page is null || page.MemberDocument is null) return Result<PageFileRef>.Failure("Page introuvable.");
        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, page.MemberDocument.MemberId, ct))
            return Result<PageFileRef>.Failure("Accès non autorisé.");

        var path = page.FilePath;
        context.MemberDocumentPages.Remove(page);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("DeletePage", "MemberDocument", page.MemberDocumentId, oldValues: new { page.FileName }, cancellationToken: ct);
        return Result<PageFileRef>.Success(new PageFileRef(path));
    }
}

// Resolves the on-disk path for an extra page download (own/leader access via the parent document's member).
public record GetDocumentPageFileQuery(Guid PageId) : IRequest<DocumentFileDto?>;

public class GetDocumentPageFileQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetDocumentPageFileQuery, DocumentFileDto?>
{
    public async ValueTask<DocumentFileDto?> Handle(GetDocumentPageFileQuery request, CancellationToken ct)
    {
        var page = await context.MemberDocumentPages.Include(p => p.MemberDocument).FirstOrDefaultAsync(p => p.Id == request.PageId, ct);
        if (page is null || page.MemberDocument is null) return null;
        if (!await DocumentAccessHelper.CanAccessMember(context, currentUser, page.MemberDocument.MemberId, ct))
            return null;
        return new DocumentFileDto(page.FilePath, page.FileName, page.MimeType);
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
        if (!DocumentAccessHelper.IsUnitLeaderFor(currentUser, request.UnitId))
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

// PageLabel distinguishes files of the same document in the zip (e.g. "" for page 1, " - p2" for extra pages).
public record ZipDocumentDto(string MemberName, string DocTypeName, string FileName, string FilePath, string PageLabel = "");

public class GetUnitDocumentFilesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetUnitDocumentFilesQuery, Result<IReadOnlyList<ZipDocumentDto>>>
{
    public async ValueTask<Result<IReadOnlyList<ZipDocumentDto>>> Handle(GetUnitDocumentFilesQuery request, CancellationToken ct)
    {
        if (!DocumentAccessHelper.IsUnitLeaderFor(currentUser, request.UnitId))
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

        // Materialize with pages, then flatten each document into one entry per file (page 1 + extra pages).
        var docs = await query
            .Include(d => d.Member).Include(d => d.DocumentType).Include(d => d.Pages)
            .OrderBy(d => d.Member.LastName).ThenBy(d => d.Member.FirstName)
            .ToListAsync(ct);

        var files = new List<ZipDocumentDto>();
        foreach (var d in docs)
        {
            var name = d.Member.FirstName + " " + d.Member.LastName;
            files.Add(new ZipDocumentDto(name, d.DocumentType.Name, d.FileName, d.FilePath));
            foreach (var p in d.Pages.OrderBy(p => p.PageOrder))
                files.Add(new ZipDocumentDto(name, d.DocumentType.Name, p.FileName, p.FilePath, $" - p{p.PageOrder}"));
        }

        return Result<IReadOnlyList<ZipDocumentDto>>.Success(files);
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

        // Leader-only dashboard tile: a non-leader (read-only youth holds documents.view) gets nothing.
        // Unit-scope for non-super-admin leaders.
        if (!currentUser.IsSuperAdmin)
        {
            if (!currentUser.Permissions.Contains(Permissions.MembersEdit))
                return [];
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
