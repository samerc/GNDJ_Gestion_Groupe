using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.AuditLogs;

// Read-only viewer over the append-only audit trail written by IAuditService on every mutation.
// OldValues/NewValues are stored as JSON strings (rendered as a key/value table by the admin UI).
public record AuditLogDto(
    Guid Id, Guid? UserId, string? UserEmail,
    string Action, string EntityType, Guid? EntityId,
    string? OldValues, string? NewValues,
    string? IpAddress, DateTime Timestamp
);

// Paginated audit-log query with entity-type / action / user / date-range filters (newest first).
public record GetAuditLogsQuery(
    string? EntityType, string? Action, Guid? UserId,
    DateTime? From, DateTime? To,
    int Page = 1, int PageSize = 50
) : IRequest<PaginatedList<AuditLogDto>>;

public class GetAuditLogsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAuditLogsQuery, PaginatedList<AuditLogDto>>
{
    public async ValueTask<PaginatedList<AuditLogDto>> Handle(GetAuditLogsQuery request, CancellationToken ct)
    {
        var query = context.AuditLogs.AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.EntityType))
            query = query.Where(a => a.EntityType == request.EntityType);
        if (!string.IsNullOrWhiteSpace(request.Action))
            query = query.Where(a => a.Action == request.Action);
        if (request.UserId.HasValue)
            query = query.Where(a => a.UserId == request.UserId.Value);
        // timestamp is a timestamptz column; Npgsql only accepts UTC DateTimes. A date bound off the query string
        // arrives as Kind=Unspecified → normalize to UTC (else Npgsql throws "only UTC is supported").
        if (request.From.HasValue)
        {
            var fromUtc = ToUtc(request.From.Value);
            query = query.Where(a => a.Timestamp >= fromUtc);
        }
        if (request.To.HasValue)
        {
            var toUtc = ToUtc(request.To.Value);
            query = query.Where(a => a.Timestamp <= toUtc);
        }

        var projected = query
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new AuditLogDto(
                a.Id, a.UserId, a.User != null ? a.User.Email : null,
                a.Action, a.EntityType, a.EntityId,
                a.OldValues, a.NewValues,
                a.IpAddress, a.Timestamp
            ));

        return await PaginatedList<AuditLogDto>.CreateAsync(projected, request.Page, request.PageSize, ct);
    }

    // A query-string date bound arrives as Kind=Unspecified; the timestamptz column requires UTC.
    private static DateTime ToUtc(DateTime d) => d.Kind == DateTimeKind.Unspecified
        ? DateTime.SpecifyKind(d, DateTimeKind.Utc)
        : d.ToUniversalTime();
}

// Distinct entity types and actions for filter dropdowns
public record GetAuditFilterOptionsQuery() : IRequest<AuditFilterOptionsDto>;
public record AuditFilterOptionsDto(IReadOnlyList<string> EntityTypes, IReadOnlyList<string> Actions);

public class GetAuditFilterOptionsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAuditFilterOptionsQuery, AuditFilterOptionsDto>
{
    public async ValueTask<AuditFilterOptionsDto> Handle(GetAuditFilterOptionsQuery request, CancellationToken ct)
    {
        var entityTypes = await context.AuditLogs.Select(a => a.EntityType).Distinct().OrderBy(x => x).ToListAsync(ct);
        var actions = await context.AuditLogs.Select(a => a.Action).Distinct().OrderBy(x => x).ToListAsync(ct);
        return new AuditFilterOptionsDto(entityTypes, actions);
    }
}

// Clear the audit trail — SUPER-ADMIN ONLY (the audit trail is sensitive; wiping it is a serious action, so it's
// restricted beyond the audit.view viewers, mirroring the error-log "Vider le journal"). Optional Before keeps
// newer entries. Hard delete (AuditLog is a plain, append-only entity — no soft-delete).
public record PurgeAuditLogsCommand(DateTime? Before) : IRequest<int>;

public class PurgeAuditLogsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<PurgeAuditLogsCommand, int>
{
    public async ValueTask<int> Handle(PurgeAuditLogsCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            throw new UnauthorizedAccessException("Vider le journal d'audit est réservé au super-administrateur.");

        var query = context.AuditLogs.AsQueryable();
        if (request.Before is DateTime before)
        {
            // timestamp is a timestamptz column; Npgsql only accepts UTC DateTimes. A date bound off the query
            // string arrives as Kind=Unspecified → treat it as UTC (else Npgsql throws).
            var beforeUtc = before.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(before, DateTimeKind.Utc)
                : before.ToUniversalTime();
            query = query.Where(a => a.Timestamp < beforeUtc);
        }
        return await query.ExecuteDeleteAsync(ct);
    }
}
