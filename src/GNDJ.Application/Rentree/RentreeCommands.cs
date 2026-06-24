using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// ── Template CRUD (super-admin + CG) ─────────────────────────────────────────
public record SaveRentreeTemplateCommand(
    Guid? Id, string Title, string? Description, string Phase,
    string AssigneeType, string? AssigneeRole, bool FanOutPerUnit, List<Guid> AssigneeMemberIds,
    string? DefaultDeadlineLabel, List<Guid> DependsOnTemplateIds) : IRequest<Result<Guid>>;

public class SaveRentreeTemplateCommandHandler(IApplicationDbContext context) : IRequestHandler<SaveRentreeTemplateCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(SaveRentreeTemplateCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return Result<Guid>.Failure("Le titre est requis.");
        if (string.IsNullOrWhiteSpace(request.Phase)) return Result<Guid>.Failure("La phase est requise.");
        if (request.AssigneeType is not ("role" or "members")) return Result<Guid>.Failure("Type d'assignation invalide.");

        RentreeTaskTemplate entity;
        if (request.Id.HasValue)
        {
            entity = await context.RentreeTaskTemplates.FirstOrDefaultAsync(t => t.Id == request.Id, ct)
                     ?? throw new KeyNotFoundException();
        }
        else
        {
            var maxOrder = await context.RentreeTaskTemplates.Select(t => (int?)t.DisplayOrder).MaxAsync(ct) ?? 0;
            entity = new RentreeTaskTemplate { DisplayOrder = maxOrder + 1 };
            context.RentreeTaskTemplates.Add(entity);
        }

        entity.Title = request.Title.Trim();
        entity.Description = request.Description?.Trim();
        entity.Phase = request.Phase.Trim();
        entity.AssigneeType = request.AssigneeType;
        entity.AssigneeRole = request.AssigneeType == "role" ? request.AssigneeRole : null;
        entity.FanOutPerUnit = request.AssigneeType == "role" && request.FanOutPerUnit;
        entity.AssigneeMemberIds = request.AssigneeType == "members" ? request.AssigneeMemberIds.Distinct().ToArray() : [];
        entity.DefaultDeadlineLabel = request.DefaultDeadlineLabel?.Trim();
        entity.DependsOnTemplateIds = (request.DependsOnTemplateIds ?? []).Where(d => d != request.Id).Distinct().ToArray();

        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(entity.Id);
    }
}

public record DeleteRentreeTemplateCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteRentreeTemplateCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteRentreeTemplateCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteRentreeTemplateCommand request, CancellationToken ct)
    {
        var entity = await context.RentreeTaskTemplates.FirstOrDefaultAsync(t => t.Id == request.Id, ct);
        if (entity is null) return Result<bool>.Failure("Modèle introuvable.");
        context.RentreeTaskTemplates.Remove(entity);
        // Drop this template from other templates' dependency lists.
        var dependents = await context.RentreeTaskTemplates.Where(t => t.DependsOnTemplateIds.Contains(request.Id)).ToListAsync(ct);
        foreach (var d in dependents) d.DependsOnTemplateIds = d.DependsOnTemplateIds.Where(x => x != request.Id).ToArray();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record ReorderRentreeTemplatesCommand(List<Guid> OrderedIds) : IRequest<Result<bool>>;

public class ReorderRentreeTemplatesCommandHandler(IApplicationDbContext context) : IRequestHandler<ReorderRentreeTemplatesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReorderRentreeTemplatesCommand request, CancellationToken ct)
    {
        if (request.OrderedIds.Count > 1000) return Result<bool>.Failure("Trop d'éléments.");
        var all = await context.RentreeTaskTemplates.ToListAsync(ct);
        for (int i = 0; i < request.OrderedIds.Count; i++)
        {
            var t = all.FirstOrDefault(x => x.Id == request.OrderedIds[i]);
            if (t != null) t.DisplayOrder = i;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── Generate the per-year checklist from the template ────────────────────────
public record GenerateRentreeChecklistCommand(string ScoutYear, bool Overwrite) : IRequest<Result<int>>;

public class GenerateRentreeChecklistCommandHandler(IApplicationDbContext context) : IRequestHandler<GenerateRentreeChecklistCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(GenerateRentreeChecklistCommand request, CancellationToken ct)
    {
        var year = (request.ScoutYear ?? "").Trim();
        if (string.IsNullOrWhiteSpace(year)) return Result<int>.Failure("L'année scoute est requise.");

        var existing = await context.RentreeTasks.Where(t => t.ScoutYear == year).ToListAsync(ct);
        if (existing.Count > 0)
        {
            if (!request.Overwrite) return Result<int>.Failure("Une liste existe déjà pour cette année.");
            context.RentreeTasks.RemoveRange(existing);
        }

        var templates = await context.RentreeTaskTemplates.OrderBy(t => t.DisplayOrder).ThenBy(t => t.Title).ToListAsync(ct);
        if (templates.Count == 0) return Result<int>.Failure("Le modèle est vide — ajoutez des tâches au modèle d'abord.");

        var units = await context.Units.Where(u => u.IsActive).OrderBy(u => u.Name).Select(u => u.Id).ToListAsync(ct);

        // Active assignments → who holds which security-profile in which unit (for role resolution).
        var holders = await context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new { a.UnitId, a.MemberId, Code = a.FunctionalRole.SecurityProfile.Code })
            .ToListAsync(ct);

        Guid[] ResolveGroup(string? role) =>
            role is null ? [] : holders.Where(h => h.Code == role).Select(h => h.MemberId).Distinct().ToArray();
        Guid[] ResolveUnit(string? role, Guid unitId) =>
            role is null ? [] : holders.Where(h => h.Code == role && h.UnitId == unitId).Select(h => h.MemberId).Distinct().ToArray();

        // Pass 1: create tasks, remember which task(s) each template produced.
        var created = new List<RentreeTask>();
        var byTemplate = new Dictionary<Guid, List<RentreeTask>>();
        foreach (var t in templates)
        {
            var list = new List<RentreeTask>();
            if (t.AssigneeType == "role" && t.FanOutPerUnit)
            {
                foreach (var unitId in units)
                    list.Add(new RentreeTask
                    {
                        ScoutYear = year, TemplateId = t.Id, Title = t.Title, Description = t.Description,
                        Phase = t.Phase, DisplayOrder = t.DisplayOrder, AssigneeType = "role", AssigneeRole = t.AssigneeRole,
                        UnitId = unitId, AssigneeMemberIds = ResolveUnit(t.AssigneeRole, unitId), DeadlineLabel = t.DefaultDeadlineLabel,
                    });
            }
            else
            {
                list.Add(new RentreeTask
                {
                    ScoutYear = year, TemplateId = t.Id, Title = t.Title, Description = t.Description,
                    Phase = t.Phase, DisplayOrder = t.DisplayOrder, AssigneeType = t.AssigneeType, AssigneeRole = t.AssigneeRole,
                    AssigneeMemberIds = t.AssigneeType == "members" ? t.AssigneeMemberIds : ResolveGroup(t.AssigneeRole),
                    DeadlineLabel = t.DefaultDeadlineLabel,
                });
            }
            byTemplate[t.Id] = list;
            created.AddRange(list);
        }

        // Pass 2: wire dependencies. Per-unit→per-unit matches the same unit; otherwise link all.
        foreach (var t in templates)
        {
            foreach (var task in byTemplate[t.Id])
            {
                var deps = new List<Guid>();
                foreach (var depTemplateId in t.DependsOnTemplateIds)
                {
                    if (!byTemplate.TryGetValue(depTemplateId, out var depTasks)) continue;
                    if (task.UnitId.HasValue && depTasks.Count > 1 && depTasks.All(d => d.UnitId.HasValue))
                    {
                        var same = depTasks.FirstOrDefault(d => d.UnitId == task.UnitId);
                        if (same != null) deps.Add(same.Id); else deps.AddRange(depTasks.Select(d => d.Id));
                    }
                    else deps.AddRange(depTasks.Select(d => d.Id));
                }
                task.DependsOnTaskIds = deps.Distinct().ToArray();
            }
        }

        context.RentreeTasks.AddRange(created);
        await context.SaveChangesAsync(ct);
        return Result<int>.Success(created.Count);
    }
}

// ── Complete / reopen a task (assignee or CG) ────────────────────────────────
public record CompleteRentreeTaskCommand(Guid Id, bool Done) : IRequest<Result<bool>>;

public class CompleteRentreeTaskCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<CompleteRentreeTaskCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(CompleteRentreeTaskCommand request, CancellationToken ct)
    {
        var task = await context.RentreeTasks.FirstOrDefaultAsync(t => t.Id == request.Id, ct);
        if (task is null) return Result<bool>.Failure("Tâche introuvable.");

        var canManage = currentUser.IsSuperAdmin || currentUser.Permissions.Contains(Permissions.RentreeManage);
        var isAssignee = currentUser.MemberId.HasValue && task.AssigneeMemberIds.Contains(currentUser.MemberId.Value);
        if (!canManage && !isAssignee) return Result<bool>.Failure("Vous n'êtes pas responsable de cette tâche.");

        if (request.Done)
        {
            var blocking = await context.RentreeTasks
                .Where(t => task.DependsOnTaskIds.Contains(t.Id) && t.Status != "done").CountAsync(ct);
            if (blocking > 0) return Result<bool>.Failure("Des tâches préalables ne sont pas encore terminées.");

            task.Status = "done";
            task.CompletedByUserId = currentUser.UserId;
            task.CompletedByName = currentUser.MemberId.HasValue
                ? await context.Members.Where(m => m.Id == currentUser.MemberId).Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct)
                : "Admin";
            task.CompletedAt = DateTime.UtcNow;
        }
        else
        {
            task.Status = "pending";
            task.CompletedByUserId = null; task.CompletedByName = null; task.CompletedAt = null;
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── CG edits an instance task (date, label, assignees, text) ─────────────────
public record UpdateRentreeTaskCommand(Guid Id, string Title, string? Description, string? DeadlineLabel,
    DateOnly? DueDate, List<Guid> AssigneeMemberIds) : IRequest<Result<bool>>;

public class UpdateRentreeTaskCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateRentreeTaskCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateRentreeTaskCommand request, CancellationToken ct)
    {
        var task = await context.RentreeTasks.FirstOrDefaultAsync(t => t.Id == request.Id, ct);
        if (task is null) return Result<bool>.Failure("Tâche introuvable.");
        if (string.IsNullOrWhiteSpace(request.Title)) return Result<bool>.Failure("Le titre est requis.");
        task.Title = request.Title.Trim();
        task.Description = request.Description?.Trim();
        task.DeadlineLabel = request.DeadlineLabel?.Trim();
        task.DueDate = request.DueDate;
        task.AssigneeMemberIds = (request.AssigneeMemberIds ?? []).Distinct().ToArray();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteRentreeTaskCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteRentreeTaskCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteRentreeTaskCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteRentreeTaskCommand request, CancellationToken ct)
    {
        var task = await context.RentreeTasks.FirstOrDefaultAsync(t => t.Id == request.Id, ct);
        if (task is null) return Result<bool>.Failure("Tâche introuvable.");
        context.RentreeTasks.Remove(task);
        var dependents = await context.RentreeTasks.Where(t => t.DependsOnTaskIds.Contains(request.Id)).ToListAsync(ct);
        foreach (var d in dependents) d.DependsOnTaskIds = d.DependsOnTaskIds.Where(x => x != request.Id).ToArray();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
