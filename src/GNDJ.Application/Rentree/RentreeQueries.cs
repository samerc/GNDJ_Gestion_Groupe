using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// ── DTOs ─────────────────────────────────────────────────────────────────────
public record RentreeTemplateDto(
    Guid Id, string Title, string? Description, string Phase, int DisplayOrder,
    string AssigneeType, string? AssigneeRole, bool FanOutPerUnit,
    IReadOnlyList<Guid> AssigneeMemberIds, IReadOnlyList<string> AssigneeMemberNames,
    string? DefaultDeadlineLabel, string? DeadlineAnchor, string? ProgressKey,
    IReadOnlyList<Guid> DependsOnTemplateIds, string? ActionKey);

// One task instance. The frontend rolls up per-unit instances sharing a TemplateId into one row.
// Computed fields:
//   DueDate     — the EFFECTIVE due date: the anchored date-setting value if the task has a DeadlineAnchor,
//                 else the stored manual DueDate. Drives IsOverdue + the deadline chip.
//   ProgressKey/ProgressLabel/ProgressCurrent/ProgressTotal/ProgressComplete — the live module-state signal
//                 (a task auto-satisfies when ProgressComplete).
//   IsDone      — EFFECTIVE done: Status=="done" OR ProgressComplete (used for blocking + phase counts).
//   IsBlocked   — a dependency isn't effectively done yet (with BlockedByTitles).
//   IsMine      — the caller is an assignee. IsOverdue — not done + past the effective due date.
public record RentreeTaskDto(
    Guid Id, Guid? TemplateId, string ScoutYear, string Title, string? Description, string Phase, int DisplayOrder,
    string AssigneeType, string? AssigneeRole, Guid? UnitId, string? UnitName,
    IReadOnlyList<Guid> AssigneeMemberIds, IReadOnlyList<string> AssigneeNames,
    string? DeadlineLabel, DateOnly? DueDate, string? DeadlineAnchor,
    string Status, string? CompletedByName, DateTime? CompletedAt,
    IReadOnlyList<Guid> DependsOnTaskIds, bool IsBlocked, IReadOnlyList<string> BlockedByTitles,
    bool IsMine, bool IsOverdue, string? ActionKey,
    string? ProgressKey, string? ProgressLabel, int? ProgressCurrent, int? ProgressTotal, bool ProgressComplete, bool IsDone);

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
            t.DefaultDeadlineLabel, t.DeadlineAnchor, t.ProgressKey, t.DependsOnTemplateIds, t.ActionKey)).ToList();
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

        // Effective due dates (anchor-resolved) + live progress (module state). Both drive "done"/"overdue".
        var dueByTask = await RentreeAnchors.ResolveDueDatesAsync(context, tasks, ct);
        var progress = await RentreeProgress.ComputeAsync(context, tasks, request.ScoutYear, ct);

        // Effective done = manually completed OR its progress signal reports complete (auto-satisfied).
        bool EffectiveDone(Domain.Entities.RentreeTask t) =>
            t.Status == "done" || (progress.TryGetValue(t.Id, out var p) && p.Complete);
        var doneIds = tasks.Where(EffectiveDone).Select(t => t.Id).ToHashSet();
        var titleById = tasks.ToDictionary(t => t.Id, t => t.Title);
        var myMemberId = currentUser.MemberId;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var result = tasks.Select(t =>
        {
            var blockedBy = t.DependsOnTaskIds.Where(d => !doneIds.Contains(d)).ToList();
            var isMine = myMemberId.HasValue && t.AssigneeMemberIds.Contains(myMemberId.Value);
            var due = dueByTask.GetValueOrDefault(t.Id);
            var prog = progress.GetValueOrDefault(t.Id);
            var isDone = EffectiveDone(t);
            return new RentreeTaskDto(
                t.Id, t.TemplateId, t.ScoutYear, t.Title, t.Description, t.Phase, t.DisplayOrder,
                t.AssigneeType, t.AssigneeRole, t.UnitId, t.UnitId.HasValue ? unitNames.GetValueOrDefault(t.UnitId.Value) : null,
                t.AssigneeMemberIds, t.AssigneeMemberIds.Select(id => memberNames.GetValueOrDefault(id, "?")).ToList(),
                t.DeadlineLabel, due, t.DeadlineAnchor, t.Status, t.CompletedByName, t.CompletedAt,
                t.DependsOnTaskIds, blockedBy.Count > 0, blockedBy.Select(d => titleById.GetValueOrDefault(d, "?")).ToList(),
                isMine, !isDone && due.HasValue && due.Value < today, t.ActionKey,
                t.ProgressKey, prog?.Label, prog?.Current, prog?.Total, prog?.Complete ?? false, isDone);
        });

        // Managers (super-admin / rentree.manage = CG) can see everyone's tasks; everyone else
        // (a CU, an assistant, a regular member) only ever sees the tasks assigned to them.
        var isManager = currentUser.IsSuperAdmin || currentUser.Permissions.Contains(Permissions.RentreeManage);
        if (request.MineOnly || !isManager)
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

        // Candidates: my not-yet-completed tasks that carry SOME deadline (a fixed date or a live anchor).
        var tasks = await context.RentreeTasks
            .Where(t => t.Status != "done" && t.AssigneeMemberIds.Contains(myId)
                        && (t.DueDate != null || t.DeadlineAnchor != null))
            .ToListAsync(ct);
        if (tasks.Count == 0) return [];

        // Resolve effective due dates + progress (per year, since tasks may span years) to skip auto-satisfied ones.
        var dueByTask = await RentreeAnchors.ResolveDueDatesAsync(context, tasks, ct);
        var progressComplete = new HashSet<Guid>();
        foreach (var grp in tasks.GroupBy(t => t.ScoutYear))
        {
            var p = await RentreeProgress.ComputeAsync(context, grp.ToList(), grp.Key, ct);
            foreach (var kv in p) if (kv.Value.Complete) progressComplete.Add(kv.Key);
        }

        var overdue = tasks
            .Where(t => !progressComplete.Contains(t.Id)
                        && dueByTask.GetValueOrDefault(t.Id) is { } due && due < today)
            .OrderBy(t => dueByTask.GetValueOrDefault(t.Id))
            .ToList();

        return overdue.Select(t => new RentreeTaskDto(
            t.Id, t.TemplateId, t.ScoutYear, t.Title, t.Description, t.Phase, t.DisplayOrder, t.AssigneeType, t.AssigneeRole,
            t.UnitId, null, t.AssigneeMemberIds, [], t.DeadlineLabel, dueByTask.GetValueOrDefault(t.Id), t.DeadlineAnchor,
            t.Status, null, null, t.DependsOnTaskIds, false, [], true, true, t.ActionKey,
            t.ProgressKey, null, null, null, false, false)).ToList();
    }
}
