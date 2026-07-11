using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// Rentrée scoute — the start-of-year checklist. A reusable TEMPLATE of tasks (with assignees,
// dependencies and fuzzy deadlines) is generated each year into concrete RentreeTask instances:
// a role task flagged FanOutPerUnit becomes one task per active unit; assignees resolve from who
// currently holds the task's security-profile (per-unit for fan-out); dependencies are then wired
// task→task. A task can't be completed while a prerequisite is still open.

// ── Template CRUD (super-admin + CG) ─────────────────────────────────────────
public record SaveRentreeTemplateCommand(
    Guid? Id, string Title, string? Description, string Phase,
    string AssigneeType, string? AssigneeRole, bool FanOutPerUnit, List<Guid> AssigneeMemberIds,
    string? DefaultDeadlineLabel, List<Guid> DependsOnTemplateIds, string? ActionKey = null) : IRequest<Result<Guid>>;

public class SaveRentreeTemplateCommandHandler(IApplicationDbContext context) : IRequestHandler<SaveRentreeTemplateCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(SaveRentreeTemplateCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Title)) return Result<Guid>.Failure("Le titre est requis.");
        if (string.IsNullOrWhiteSpace(request.Phase)) return Result<Guid>.Failure("La phase est requise.");
        if (request.AssigneeType is not ("role" or "members")) return Result<Guid>.Failure("Type d'assignation invalide.");
        if (!RentreeActions.IsValid(request.ActionKey)) return Result<Guid>.Failure("Action inconnue.");

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
        entity.ActionKey = string.IsNullOrWhiteSpace(request.ActionKey) ? null : request.ActionKey.Trim();
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
// Three modes for an existing year:
//   Overwrite=false, AddOnly=false → fail (a list already exists).
//   Overwrite=true                 → wipe + fully regenerate (destructive, loses progress).
//   AddOnly=true                   → non-destructive: keep existing tasks + progress, only add
//                                     instances for templates not yet present this year (e.g. a task
//                                     the CG just added to the model). Returns how many were added.
public record GenerateRentreeChecklistCommand(string ScoutYear, bool Overwrite, bool AddOnly = false) : IRequest<Result<int>>;

public class GenerateRentreeChecklistCommandHandler(IApplicationDbContext context) : IRequestHandler<GenerateRentreeChecklistCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(GenerateRentreeChecklistCommand request, CancellationToken ct)
    {
        var year = (request.ScoutYear ?? "").Trim();
        if (string.IsNullOrWhiteSpace(year)) return Result<int>.Failure("L'année scoute est requise.");

        var existing = await context.RentreeTasks.Where(t => t.ScoutYear == year).ToListAsync(ct);
        var addOnly = request.AddOnly && existing.Count > 0; // add-only only makes sense against an existing list
        if (existing.Count > 0 && !request.Overwrite && !addOnly)
            return Result<int>.Failure("Une liste existe déjà pour cette année.");

        var templates = await context.RentreeTaskTemplates.OrderBy(t => t.DisplayOrder).ThenBy(t => t.Title).ToListAsync(ct);
        if (templates.Count == 0) return Result<int>.Failure("Le modèle est vide — ajoutez des tâches au modèle d'abord.");

        var units = await context.Units.Where(u => u.IsActive).OrderBy(u => u.Name).Select(u => u.Id).ToListAsync(ct);

        // Active assignments → who holds which security-profile in which unit (for role resolution).
        var holders = await context.MemberAssignments
            .Where(a => a.EndDate == null)
            .Select(a => new { a.UnitId, a.MemberId, Code = a.FunctionalRole.SecurityProfile.Code })
            .ToListAsync(ct);

        // ResolveGroup → everyone holding that security-profile anywhere (group-wide task);
        // ResolveUnit → only that profile's holders within one unit (per-unit fan-out task).
        Guid[] ResolveGroup(string? role) =>
            role is null ? [] : holders.Where(h => h.Code == role).Select(h => h.MemberId).Distinct().ToArray();
        Guid[] ResolveUnit(string? role, Guid unitId) =>
            role is null ? [] : holders.Where(h => h.Code == role && h.UnitId == unitId).Select(h => h.MemberId).Distinct().ToArray();

        // Build the instance(s) for one template: fan out per active unit, or a single group task.
        List<RentreeTask> Make(RentreeTaskTemplate t)
        {
            var list = new List<RentreeTask>();
            if (t.AssigneeType == "role" && t.FanOutPerUnit)
                foreach (var unitId in units)
                    list.Add(new RentreeTask
                    {
                        ScoutYear = year, TemplateId = t.Id, Title = t.Title, Description = t.Description,
                        Phase = t.Phase, DisplayOrder = t.DisplayOrder, AssigneeType = "role", AssigneeRole = t.AssigneeRole,
                        UnitId = unitId, AssigneeMemberIds = ResolveUnit(t.AssigneeRole, unitId), DeadlineLabel = t.DefaultDeadlineLabel,
                        ActionKey = t.ActionKey,
                    });
            else
                list.Add(new RentreeTask
                {
                    ScoutYear = year, TemplateId = t.Id, Title = t.Title, Description = t.Description,
                    Phase = t.Phase, DisplayOrder = t.DisplayOrder, AssigneeType = t.AssigneeType, AssigneeRole = t.AssigneeRole,
                    AssigneeMemberIds = t.AssigneeType == "members" ? t.AssigneeMemberIds : ResolveGroup(t.AssigneeRole),
                    DeadlineLabel = t.DefaultDeadlineLabel, ActionKey = t.ActionKey,
                });
            return list;
        }

        // Map every template → its instance(s) for this year (existing kept ones + newly created).
        var byTemplate = new Dictionary<Guid, List<RentreeTask>>();
        int addedCount;

        if (addOnly)
        {
            // Keep existing tasks (progress preserved); index them so deps can point at them.
            foreach (var t in existing)
                if (t.TemplateId.HasValue)
                {
                    if (!byTemplate.TryGetValue(t.TemplateId.Value, out var l)) { l = []; byTemplate[t.TemplateId.Value] = l; }
                    l.Add(t);
                }
            var present = byTemplate.Keys.ToHashSet();
            var added = new List<RentreeTask>();
            foreach (var t in templates.Where(tt => !present.Contains(tt.Id)))
            {
                var list = Make(t);
                byTemplate[t.Id] = list;
                added.AddRange(list);
            }
            context.RentreeTasks.AddRange(added);
            addedCount = added.Count;
        }
        else
        {
            if (existing.Count > 0) context.RentreeTasks.RemoveRange(existing); // overwrite / regenerate
            var created = new List<RentreeTask>();
            foreach (var t in templates) { var list = Make(t); byTemplate[t.Id] = list; created.AddRange(list); }
            context.RentreeTasks.AddRange(created);
            addedCount = created.Count;
        }

        // (Re)wire dependencies across every task in the year from the current template graph
        // (so a newly added task links to existing prerequisites, and vice-versa). Per-unit→per-unit
        // matches the same unit; otherwise link all. Existing tasks' deps recompute to the same ids.
        foreach (var t in templates)
        {
            if (!byTemplate.TryGetValue(t.Id, out var tasksForTemplate)) continue;
            foreach (var task in tasksForTemplate)
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

        await context.SaveChangesAsync(ct);
        return Result<int>.Success(addedCount);
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

// ── Run a task's built-in "do" action from the checklist (CG) ────────────────
// Executes the operation the task represents (e.g. open the inscriptions / the passage) directly from
// the list, then marks the task done. Only "do" actions run here; "goto-*" actions are frontend-only.
public record RunRentreeTaskActionCommand(Guid Id) : IRequest<Result<string>>;

public class RunRentreeTaskActionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<RunRentreeTaskActionCommand, Result<string>>
{
    public async ValueTask<Result<string>> Handle(RunRentreeTaskActionCommand request, CancellationToken ct)
    {
        var task = await context.RentreeTasks.FirstOrDefaultAsync(t => t.Id == request.Id, ct);
        if (task is null) return Result<string>.Failure("Tâche introuvable.");
        if (string.IsNullOrEmpty(task.ActionKey) || !RentreeActions.DoActions.Contains(task.ActionKey))
            return Result<string>.Failure("Cette tâche n'a pas d'action exécutable.");

        // Same gate as completing: refuse while a prerequisite is still open.
        var blocking = await context.RentreeTasks
            .Where(t => task.DependsOnTaskIds.Contains(t.Id) && t.Status != "done").CountAsync(ct);
        if (blocking > 0) return Result<string>.Failure("Des tâches préalables ne sont pas encore terminées.");

        async Task SetSetting(string key, string value, string category, string label)
        {
            var s = await context.Settings.FirstOrDefaultAsync(x => x.Key == key, ct);
            if (s is null) context.Settings.Add(new Setting { Key = key, Value = value, Category = category, Label = label, ValueType = "boolean" });
            else s.Value = value;
        }

        string message;
        switch (task.ActionKey)
        {
            case RentreeActions.OpenDemandes:
                await SetSetting("demande.enabled", "true", "demande", "Inscriptions ouvertes");
                await audit.LogAsync("OpenInscriptions", "Demande", null, cancellationToken: ct);
                message = "Les inscriptions sont ouvertes.";
                break;
            case RentreeActions.OpenPassage:
                await SetSetting("passage.enabled", "true", "passage", "Passage annuel actif");
                await audit.LogAsync("OpenPassage", "Passage", null, cancellationToken: ct);
                message = "Le passage est ouvert.";
                break;
            default:
                return Result<string>.Failure("Action non prise en charge.");
        }

        // Auto-complete the task now that its action ran.
        task.Status = "done";
        task.CompletedByUserId = currentUser.UserId;
        task.CompletedByName = currentUser.MemberId.HasValue
            ? await context.Members.Where(m => m.Id == currentUser.MemberId).Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct)
            : "Admin";
        task.CompletedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);
        return Result<string>.Success(message);
    }
}

// ── CG adds a one-off task directly to a year (not in the template) ──────────
// Year-specific: creates the instance(s) immediately (fan-out per active unit for a role task) and
// resolves assignees now. TemplateId stays null so regenerate/add-new never touch it. No prerequisites.
public record CreateRentreeTaskCommand(
    string ScoutYear, string Title, string? Description, string Phase,
    string AssigneeType, string? AssigneeRole, bool FanOutPerUnit, List<Guid> AssigneeMemberIds,
    string? DeadlineLabel, DateOnly? DueDate, string? ActionKey) : IRequest<Result<int>>;

public class CreateRentreeTaskCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateRentreeTaskCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(CreateRentreeTaskCommand request, CancellationToken ct)
    {
        var year = (request.ScoutYear ?? "").Trim();
        if (string.IsNullOrWhiteSpace(year)) return Result<int>.Failure("L'année scoute est requise.");
        if (string.IsNullOrWhiteSpace(request.Title)) return Result<int>.Failure("Le titre est requis.");
        if (string.IsNullOrWhiteSpace(request.Phase)) return Result<int>.Failure("La phase est requise.");
        if (request.AssigneeType is not ("role" or "members")) return Result<int>.Failure("Type d'assignation invalide.");
        if (!RentreeActions.IsValid(request.ActionKey)) return Result<int>.Failure("Action inconnue.");

        // Append after the year's existing tasks so it lands at the end of its phase.
        var maxOrder = await context.RentreeTasks.Where(t => t.ScoutYear == year).Select(t => (int?)t.DisplayOrder).MaxAsync(ct) ?? 0;
        var order = maxOrder + 1;
        var title = request.Title.Trim();
        var phase = request.Phase.Trim();
        var desc = request.Description?.Trim();
        var deadline = request.DeadlineLabel?.Trim();
        var actionKey = string.IsNullOrWhiteSpace(request.ActionKey) ? null : request.ActionKey.Trim();
        var role = request.AssigneeType == "role" ? request.AssigneeRole : null;
        var fanOut = request.AssigneeType == "role" && request.FanOutPerUnit;

        var created = new List<RentreeTask>();
        if (fanOut)
        {
            var units = await context.Units.Where(u => u.IsActive).OrderBy(u => u.Name).Select(u => u.Id).ToListAsync(ct);
            var holders = await context.MemberAssignments
                .Where(a => a.EndDate == null && a.FunctionalRole.SecurityProfile.Code == role)
                .Select(a => new { a.UnitId, a.MemberId }).ToListAsync(ct);
            foreach (var unitId in units)
                created.Add(new RentreeTask
                {
                    ScoutYear = year, TemplateId = null, Title = title, Description = desc, Phase = phase, DisplayOrder = order,
                    AssigneeType = "role", AssigneeRole = role, UnitId = unitId,
                    AssigneeMemberIds = holders.Where(h => h.UnitId == unitId).Select(h => h.MemberId).Distinct().ToArray(),
                    DeadlineLabel = deadline, DueDate = request.DueDate, ActionKey = actionKey,
                });
        }
        else
        {
            Guid[] assignees;
            if (request.AssigneeType == "members")
                assignees = (request.AssigneeMemberIds ?? []).Distinct().ToArray();
            else if (role != null)
                assignees = await context.MemberAssignments
                    .Where(a => a.EndDate == null && a.FunctionalRole.SecurityProfile.Code == role)
                    .Select(a => a.MemberId).Distinct().ToArrayAsync(ct);
            else assignees = [];
            created.Add(new RentreeTask
            {
                ScoutYear = year, TemplateId = null, Title = title, Description = desc, Phase = phase, DisplayOrder = order,
                AssigneeType = request.AssigneeType, AssigneeRole = role,
                AssigneeMemberIds = assignees, DeadlineLabel = deadline, DueDate = request.DueDate, ActionKey = actionKey,
            });
        }

        context.RentreeTasks.AddRange(created);
        await context.SaveChangesAsync(ct);
        return Result<int>.Success(created.Count);
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
