using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// ── DTOs ─────────────────────────────────────────────────────────────────────
public record RentreeTemplateDto(
    Guid Id, string Title, string? Description, string Phase, int DisplayOrder,
    string AssigneeType, string? AssigneeRole, bool FanOutPerUnit,
    IReadOnlyList<Guid> AssigneeMemberIds, IReadOnlyList<string> AssigneeMemberNames,
    string? DefaultDeadlineLabel, IReadOnlyList<Guid> DependsOnTemplateIds);

public record RentreeTaskDto(
    Guid Id, Guid? TemplateId, string ScoutYear, string Title, string? Description, string Phase, int DisplayOrder,
    string AssigneeType, string? AssigneeRole, Guid? UnitId, string? UnitName,
    IReadOnlyList<Guid> AssigneeMemberIds, IReadOnlyList<string> AssigneeNames,
    string? DeadlineLabel, DateOnly? DueDate,
    string Status, string? CompletedByName, DateTime? CompletedAt,
    IReadOnlyList<Guid> DependsOnTaskIds, bool IsBlocked, IReadOnlyList<string> BlockedByTitles,
    bool IsMine, bool IsOverdue);

// ── Templates ────────────────────────────────────────────────────────────────
public record GetRentreeTemplatesQuery : IRequest<IReadOnlyList<RentreeTemplateDto>>;

public class GetRentreeTemplatesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetRentreeTemplatesQuery, IReadOnlyList<RentreeTemplateDto>>
{
    public async ValueTask<IReadOnlyList<RentreeTemplateDto>> Handle(GetRentreeTemplatesQuery request, CancellationToken ct)
    {
        var templates = await context.RentreeTaskTemplates.OrderBy(t => t.DisplayOrder).ThenBy(t => t.Title).ToListAsync(ct);
        var memberIds = templates.SelectMany(t => t.AssigneeMemberIds).Distinct().ToList();
        var names = await context.Members.Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, Name = m.FirstName + " " + m.LastName }).ToDictionaryAsync(x => x.Id, x => x.Name, ct);

        return templates.Select(t => new RentreeTemplateDto(
            t.Id, t.Title, t.Description, t.Phase, t.DisplayOrder, t.AssigneeType, t.AssigneeRole, t.FanOutPerUnit,
            t.AssigneeMemberIds, t.AssigneeMemberIds.Select(id => names.GetValueOrDefault(id, "?")).ToList(),
            t.DefaultDeadlineLabel, t.DependsOnTemplateIds)).ToList();
    }
}

// ── Year list ────────────────────────────────────────────────────────────────
public record GetRentreeYearsQuery : IRequest<IReadOnlyList<string>>;

public class GetRentreeYearsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetRentreeYearsQuery, IReadOnlyList<string>>
{
    public async ValueTask<IReadOnlyList<string>> Handle(GetRentreeYearsQuery request, CancellationToken ct)
        => await context.RentreeTasks.Select(t => t.ScoutYear).Distinct().OrderByDescending(y => y).ToListAsync(ct);
}

// ── Tasks for a year ─────────────────────────────────────────────────────────
public record GetRentreeTasksQuery(string ScoutYear, bool MineOnly = false) : IRequest<IReadOnlyList<RentreeTaskDto>>;

public class GetRentreeTasksQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetRentreeTasksQuery, IReadOnlyList<RentreeTaskDto>>
{
    public async ValueTask<IReadOnlyList<RentreeTaskDto>> Handle(GetRentreeTasksQuery request, CancellationToken ct)
    {
        var tasks = await context.RentreeTasks
            .Where(t => t.ScoutYear == request.ScoutYear)
            .OrderBy(t => t.DisplayOrder).ThenBy(t => t.Title)
            .ToListAsync(ct);

        var unitIds = tasks.Where(t => t.UnitId.HasValue).Select(t => t.UnitId!.Value).Distinct().ToList();
        var unitNames = await context.Units.Where(u => unitIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Name }).ToDictionaryAsync(x => x.Id, x => x.Name, ct);

        var memberIds = tasks.SelectMany(t => t.AssigneeMemberIds).Distinct().ToList();
        var memberNames = await context.Members.Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, Name = m.FirstName + " " + m.LastName }).ToDictionaryAsync(x => x.Id, x => x.Name, ct);

        var doneIds = tasks.Where(t => t.Status == "done").Select(t => t.Id).ToHashSet();
        var titleById = tasks.ToDictionary(t => t.Id, t => t.Title);
        var myMemberId = currentUser.MemberId;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var result = tasks.Select(t =>
        {
            var blockedBy = t.DependsOnTaskIds.Where(d => !doneIds.Contains(d)).ToList();
            var isMine = myMemberId.HasValue && t.AssigneeMemberIds.Contains(myMemberId.Value);
            return new RentreeTaskDto(
                t.Id, t.TemplateId, t.ScoutYear, t.Title, t.Description, t.Phase, t.DisplayOrder,
                t.AssigneeType, t.AssigneeRole, t.UnitId, t.UnitId.HasValue ? unitNames.GetValueOrDefault(t.UnitId.Value) : null,
                t.AssigneeMemberIds, t.AssigneeMemberIds.Select(id => memberNames.GetValueOrDefault(id, "?")).ToList(),
                t.DeadlineLabel, t.DueDate, t.Status, t.CompletedByName, t.CompletedAt,
                t.DependsOnTaskIds, blockedBy.Count > 0, blockedBy.Select(d => titleById.GetValueOrDefault(d, "?")).ToList(),
                isMine, t.Status != "done" && t.DueDate.HasValue && t.DueDate.Value < today);
        });

        if (request.MineOnly)
            result = result.Where(t => t.IsMine);

        return result.ToList();
    }
}

// ── My overdue tasks (login popup) ──────────────────────────────────────────
public record GetMyOverdueRentreeTasksQuery : IRequest<IReadOnlyList<RentreeTaskDto>>;

public class GetMyOverdueRentreeTasksQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMyOverdueRentreeTasksQuery, IReadOnlyList<RentreeTaskDto>>
{
    public async ValueTask<IReadOnlyList<RentreeTaskDto>> Handle(GetMyOverdueRentreeTasksQuery request, CancellationToken ct)
    {
        if (!currentUser.MemberId.HasValue) return [];
        var myId = currentUser.MemberId.Value;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var tasks = await context.RentreeTasks
            .Where(t => t.Status != "done" && t.DueDate != null && t.DueDate < today && t.AssigneeMemberIds.Contains(myId))
            .OrderBy(t => t.DueDate)
            .ToListAsync(ct);

        return tasks.Select(t => new RentreeTaskDto(
            t.Id, t.TemplateId, t.ScoutYear, t.Title, t.Description, t.Phase, t.DisplayOrder, t.AssigneeType, t.AssigneeRole,
            t.UnitId, null, t.AssigneeMemberIds, [], t.DeadlineLabel, t.DueDate, t.Status, null, null,
            t.DependsOnTaskIds, false, [], true, true)).ToList();
    }
}
