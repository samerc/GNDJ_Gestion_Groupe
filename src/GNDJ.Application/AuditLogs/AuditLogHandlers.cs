using System.Text;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.AuditLogs;

// Read-only viewer over the append-only audit trail written by IAuditService on every mutation.
// OldValues/NewValues are stored as JSON strings (rendered as a key/value table by the admin UI).
public record AuditLogDto(
    Guid Id, Guid? UserId, string? UserEmail,
    string Action, string EntityType, Guid? EntityId,
    string? OldValues, string? NewValues,
    string? IpAddress, DateTime Timestamp,
    // Browser / device string captured on every action (incl. Login/LoginFailed) — for troubleshooting a
    // login issue: which device/browser the attempt came from. Already stored; surfaced in the detail dialog.
    string? UserAgent
);

// ── Shared filter application (used by the list, export and — partly — purge) ──
internal static class AuditFilters
{
    // Apply the entity/action/user/date/search filters. The search matches user email, IP, action, entity type
    // AND the JSON before/after snapshots (which hold the resolved names via AuditNames) — accent/case-insensitive
    // (DbFns.Unaccent kept INSIDE the expression so it runs in SQL; JsonbToText renders jsonb → text for the LIKE).
    public static IQueryable<AuditLog> Apply(IQueryable<AuditLog> query,
        string? entityType, string? action, Guid? userId, DateTime? from, DateTime? to, string? search)
    {
        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(a => a.EntityType == entityType);
        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(a => a.Action == action);
        if (userId.HasValue)
            query = query.Where(a => a.UserId == userId.Value);
        // timestamp is a timestamptz column; Npgsql only accepts UTC DateTimes. A date bound off the query string
        // arrives as Kind=Unspecified → normalize to UTC (else Npgsql throws "only UTC is supported").
        if (from.HasValue)
        {
            var fromUtc = from.Value.AsUtc();
            query = query.Where(a => a.Timestamp >= fromUtc);
        }
        if (to.HasValue)
        {
            var toUtc = to.Value.AsUtc();
            query = query.Where(a => a.Timestamp <= toUtc);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(a =>
                (a.User != null && DbFns.Unaccent(a.User.Email.ToLower()).Contains(DbFns.Unaccent(s))) ||
                (a.IpAddress != null && a.IpAddress.ToLower().Contains(s)) ||
                DbFns.Unaccent(a.Action.ToLower()).Contains(DbFns.Unaccent(s)) ||
                DbFns.Unaccent(a.EntityType.ToLower()).Contains(DbFns.Unaccent(s)) ||
                (a.OldValues != null && DbFns.Unaccent(DbFns.JsonbToText(a.OldValues).ToLower()).Contains(DbFns.Unaccent(s))) ||
                (a.NewValues != null && DbFns.Unaccent(DbFns.JsonbToText(a.NewValues).ToLower()).Contains(DbFns.Unaccent(s))));
        }
        return query;
    }

    // Project an audit row (with its user email) to the read DTO, newest first.
    public static IQueryable<AuditLogDto> ToDto(IQueryable<AuditLog> query) => query
        .OrderByDescending(a => a.Timestamp)
        .Select(a => new AuditLogDto(
            a.Id, a.UserId, a.User != null ? a.User.Email : null,
            a.Action, a.EntityType, a.EntityId,
            a.OldValues, a.NewValues,
            a.IpAddress, a.Timestamp, a.UserAgent));
}

// Paginated audit-log query with entity-type / action / user / date-range filters + a free-text search (newest first).
public record GetAuditLogsQuery(
    string? EntityType, string? Action, Guid? UserId,
    DateTime? From, DateTime? To,
    string? Search = null,
    int Page = 1, int PageSize = 50
) : IRequest<PaginatedList<AuditLogDto>>;

public class GetAuditLogsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAuditLogsQuery, PaginatedList<AuditLogDto>>
{
    public async ValueTask<PaginatedList<AuditLogDto>> Handle(GetAuditLogsQuery request, CancellationToken ct)
    {
        var query = AuditFilters.Apply(context.AuditLogs.AsQueryable(),
            request.EntityType, request.Action, request.UserId, request.From, request.To, request.Search);
        return await PaginatedList<AuditLogDto>.CreateAsync(AuditFilters.ToDto(query), request.Page, request.PageSize, ct);
    }
}

// ── Per-member audit trail (the "Journal" tab on a member's fiche; visible to audit.view = CG/admin) ──
// "Related to this member" = the member is the direct subject (EntityId == memberId — profile/contact edits,
// password reset, delegation, super-admin, restore/purge, custom fields…) OR the member's own account is the
// actor (UserId == the member's linked user — their logins, self-service edits, proposals). NOTE: actions on the
// member's OWNED entities (a document/assignment/cotisation row) log the CHILD entity's id, so they are NOT caught
// here — surfacing those too would need a dedicated member_id column on audit_logs (a future enhancement).
public record GetMemberAuditLogsQuery(Guid MemberId, int Page = 1, int PageSize = 30) : IRequest<PaginatedList<AuditLogDto>>;

public class GetMemberAuditLogsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetMemberAuditLogsQuery, PaginatedList<AuditLogDto>>
{
    public async ValueTask<PaginatedList<AuditLogDto>> Handle(GetMemberAuditLogsQuery request, CancellationToken ct)
    {
        // The member's linked login (if any) — to also capture actions the member performed themselves.
        var userId = await context.Users
            .Where(u => u.MemberId == request.MemberId && !u.IsDeleted)
            .Select(u => (Guid?)u.Id).FirstOrDefaultAsync(ct);

        // entity_id = member (subject) OR user_id = the member's login (actor). Both columns are indexed → BitmapOr.
        var query = context.AuditLogs
            .Where(a => a.EntityId == request.MemberId || (userId != null && a.UserId == userId));
        return await PaginatedList<AuditLogDto>.CreateAsync(AuditFilters.ToDto(query), request.Page, request.PageSize, ct);
    }
}

// Distinct entity types, actions and users for the viewer's filter dropdowns.
public record GetAuditFilterOptionsQuery() : IRequest<AuditFilterOptionsDto>;
public record AuditUserOptionDto(Guid Id, string Email);
public record AuditFilterOptionsDto(
    IReadOnlyList<string> EntityTypes, IReadOnlyList<string> Actions, IReadOnlyList<AuditUserOptionDto> Users);

public class GetAuditFilterOptionsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAuditFilterOptionsQuery, AuditFilterOptionsDto>
{
    public async ValueTask<AuditFilterOptionsDto> Handle(GetAuditFilterOptionsQuery request, CancellationToken ct)
    {
        var entityTypes = await context.AuditLogs.Select(a => a.EntityType).Distinct().OrderBy(x => x).ToListAsync(ct);
        var actions = await context.AuditLogs.Select(a => a.Action).Distinct().OrderBy(x => x).ToListAsync(ct);
        // The distinct users who appear as an actor in the trail (so "all actions by X" is one click).
        var users = await context.AuditLogs
            .Where(a => a.User != null)
            .Select(a => new AuditUserOptionDto(a.UserId!.Value, a.User!.Email))
            .Distinct().OrderBy(u => u.Email).ToListAsync(ct);
        return new AuditFilterOptionsDto(entityTypes, actions, users);
    }
}

// ── Export the (filtered) audit trail to a CSV file (audit.view) ──
public record AuditFile(byte[] Data, string FileName);
public record ExportAuditLogsQuery(
    string? EntityType, string? Action, Guid? UserId, DateTime? From, DateTime? To, string? Search
) : IRequest<AuditFile>;

public class ExportAuditLogsQueryHandler(IApplicationDbContext context) : IRequestHandler<ExportAuditLogsQuery, AuditFile>
{
    public async ValueTask<AuditFile> Handle(ExportAuditLogsQuery request, CancellationToken ct)
    {
        var query = AuditFilters.Apply(context.AuditLogs.AsQueryable(),
            request.EntityType, request.Action, request.UserId, request.From, request.To, request.Search);
        var bytes = await AuditCsv.BuildAsync(query, ct);
        return new AuditFile(bytes, $"journal-audit-{LebanonClock.Today:yyyy-MM-dd}.csv");
    }
}

// ── Clear the audit trail — SUPER-ADMIN ONLY. Exports the deleted rows to a CSV FIRST (an off-app backup is always
// produced, since wiping the trail is irreversible), then hard-deletes them, then leaves a surviving "Purge" audit
// row recording who cleared how many. Optional Before keeps newer entries. ──
public record AuditPurgeResult(byte[] Csv, string FileName, int Deleted);
public record PurgeAuditLogsCommand(DateTime? Before) : IRequest<AuditPurgeResult>;

public class PurgeAuditLogsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<PurgeAuditLogsCommand, AuditPurgeResult>
{
    public async ValueTask<AuditPurgeResult> Handle(PurgeAuditLogsCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            throw new UnauthorizedAccessException("Vider le journal d'audit est réservé au super-administrateur.");

        var query = context.AuditLogs.AsQueryable();
        DateTime? beforeUtc = null;
        if (request.Before is DateTime before)
        {
            // timestamp is a timestamptz column; a query-string date arrives Kind=Unspecified → normalize to UTC.
            beforeUtc = before.AsUtc();
            query = query.Where(a => a.Timestamp < beforeUtc);
        }

        // Serialize the rows to a CSV backup BEFORE deleting anything (irreversible action → always keep a copy).
        var csv = await AuditCsv.BuildAsync(query, ct);
        var deleted = await query.ExecuteDeleteAsync(ct);

        // Leave a record that the purge happened (survives even a "delete everything" because it's written after).
        await audit.LogAsync("Purge", "AuditLog", null, newValues: new
        {
            Count = deleted,
            Before = beforeUtc?.ToString("o") ?? "tout",
        }, cancellationToken: ct);

        return new AuditPurgeResult(csv, $"journal-audit-supprime-{LebanonClock.Today:yyyy-MM-dd}.csv", deleted);
    }
}

// Builds a UTF-8 (BOM) CSV of the given audit rows — one row per entry, newest first, with the full before/after
// JSON snapshots. Used by both the manual export and the purge backup.
internal static class AuditCsv
{
    public static async Task<byte[]> BuildAsync(IQueryable<AuditLog> query, CancellationToken ct)
    {
        var rows = await query
            .OrderByDescending(a => a.Timestamp)
            .Select(a => new
            {
                a.Timestamp,
                Email = a.User != null ? a.User.Email : null,
                a.Action, a.EntityType, a.EntityId, a.IpAddress, a.UserAgent, a.OldValues, a.NewValues
            })
            .ToListAsync(ct);

        var sb = new StringBuilder();
        sb.Append('﻿'); // BOM so Excel opens the UTF-8 accents correctly
        sb.Append("Date,Utilisateur,Action,Entité,ID entité,IP,Navigateur,Avant,Après\r\n");
        foreach (var r in rows)
        {
            sb.Append(Cell(r.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"))).Append(',');
            sb.Append(Cell(r.Email)).Append(',');
            sb.Append(Cell(r.Action)).Append(',');
            sb.Append(Cell(r.EntityType)).Append(',');
            sb.Append(Cell(r.EntityId?.ToString())).Append(',');
            sb.Append(Cell(r.IpAddress)).Append(',');
            sb.Append(Cell(r.UserAgent)).Append(',');
            sb.Append(Cell(r.OldValues)).Append(',');
            sb.Append(Cell(r.NewValues)).Append("\r\n");
        }
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    // RFC-4180 CSV escaping: wrap in quotes + double any inner quote when the value has a comma/quote/newline.
    private static string Cell(string? v)
    {
        v ??= "";
        if (v.IndexOfAny(['"', ',', '\n', '\r']) < 0) return v;
        return "\"" + v.Replace("\"", "\"\"") + "\"";
    }
}
