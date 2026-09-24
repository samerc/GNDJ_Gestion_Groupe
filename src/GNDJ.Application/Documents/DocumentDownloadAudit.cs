using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Documents;

// Records "who downloaded which member's file" in the audit trail. A DOWNLOAD is the sensitive access
// event — it hands the caller the actual file bytes (a medical certificate, an ID scan) — so it is logged
// even though ordinary member-data READS are deliberately NOT (reads are far too high-volume). Downloads
// are infrequent, so they live in the existing audit_logs table (reusing the viewer / search / export /
// member "Journal" tab / yearly archive) and the few name lookups per row are fine.
//
// For a single file/page the EntityId = the MEMBER id, so the event also surfaces on that member's Journal
// tab (which matches EntityId == memberId). For a bulk zip the EntityId = the UNIT id (a unit-level event,
// no single member). Action "Download" (the frontend labels it "Téléchargement"). Best-effort: the caller
// swallows failures so an audit hiccup never breaks a legitimate download.

// A single document (page 1 / the inline file).
public record LogDocumentDownloadCommand(Guid DocumentId) : IRequest<bool>;

public class LogDocumentDownloadCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<LogDocumentDownloadCommand, bool>
{
    public async ValueTask<bool> Handle(LogDocumentDownloadCommand request, CancellationToken ct)
    {
        var info = await context.MemberDocuments.IgnoreQueryFilters()
            .Where(d => d.Id == request.DocumentId)
            .Select(d => new { d.MemberId, DocType = d.DocumentType.Name, d.FileName })
            .FirstOrDefaultAsync(ct);
        if (info is null) return false;

        await audit.LogAsync("Download", "MemberDocument", info.MemberId, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, info.MemberId, ct),
            Document = info.DocType,
            info.FileName,
        }, cancellationToken: ct);
        return true;
    }
}

// An extra page of a document (resolves the member via the parent document).
public record LogDocumentPageDownloadCommand(Guid PageId) : IRequest<bool>;

public class LogDocumentPageDownloadCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<LogDocumentPageDownloadCommand, bool>
{
    public async ValueTask<bool> Handle(LogDocumentPageDownloadCommand request, CancellationToken ct)
    {
        var info = await context.MemberDocumentPages.IgnoreQueryFilters()
            .Where(p => p.Id == request.PageId)
            .Select(p => new { p.MemberDocument.MemberId, DocType = p.MemberDocument.DocumentType.Name, p.FileName })
            .FirstOrDefaultAsync(ct);
        if (info is null) return false;

        await audit.LogAsync("Download", "MemberDocument", info.MemberId, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, info.MemberId, ct),
            Document = info.DocType,
            info.FileName,
        }, cancellationToken: ct);
        return true;
    }
}

// A bulk zip of a unit's documents (optionally one doc type). No single member — logged against the unit,
// with the file count so a mass export is visible.
public record LogZipDownloadCommand(Guid UnitId, Guid? DocTypeId, int FileCount) : IRequest<bool>;

public class LogZipDownloadCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<LogZipDownloadCommand, bool>
{
    public async ValueTask<bool> Handle(LogZipDownloadCommand request, CancellationToken ct)
    {
        string? docType = request.DocTypeId is null ? null
            : (await context.DocumentTypes.IgnoreQueryFilters().Where(t => t.Id == request.DocTypeId.Value)
                .Select(t => t.Name).FirstOrDefaultAsync(ct)) ?? request.DocTypeId.ToString();

        await audit.LogAsync("Download", "MemberDocument", request.UnitId, newValues: new
        {
            Unit = await AuditNames.UnitAsync(context, request.UnitId, ct),
            Document = docType,          // null = all document types
            request.FileCount,
        }, cancellationToken: ct);
        return true;
    }
}
