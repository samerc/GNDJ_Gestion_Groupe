using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.AuditLogs;

public record AuditLogDto(
    Guid Id, Guid? UserId, string? UserEmail,
    string Action, string EntityType, Guid? EntityId,
    string? OldValues, string? NewValues,
    string? IpAddress, DateTime Timestamp
);

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
        if (request.From.HasValue)
            query = query.Where(a => a.Timestamp >= request.From.Value);
        if (request.To.HasValue)
            query = query.Where(a => a.Timestamp <= request.To.Value);

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
