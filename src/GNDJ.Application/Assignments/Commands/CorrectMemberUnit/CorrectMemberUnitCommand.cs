using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Assignments.Commands.CorrectMemberUnit;

// CORRECT a member's unit — for a WRONG placement (accepted into / passage-sent to the wrong unit). Unlike a
// passage/transfer (which ends the old assignment and creates a new one, keeping history), a correction repoints
// the CURRENT active assignment IN PLACE: the wrong unit leaves NO trace. Rules (decided with the user):
//   • the original StartDate is KEPT (they were always meant to be here);
//   • the TEAM is reset to none (old team belongs to the old unit; the receiving CU assigns a team later);
//   • the ROLE is kept when the unit type is unchanged, else replaced by the NEW type's default youth role;
//   • CG / super-admin only (a placement fix is a group-level decision);
//   • any Passage record that finalized the member INTO the wrong unit is KEPT, with a "unité corrigée" note;
//   • the automatic « Entrée » progression of the wrong unit follows the member (new unit + the new branch's stage);
//   • a demande that created this member into the wrong unit is updated (review list + archive show the right unit);
//   • the leaders of BOTH units get a notification (the new unit's chef d'unité didn't get the member in the
//     « Envoyer les réponses » Excel file, the old one did).
public record CorrectMemberUnitCommand(Guid AssignmentId, Guid NewUnitId) : IRequest<Result<bool>>;

public class CorrectMemberUnitCommandValidator : AbstractValidator<CorrectMemberUnitCommand>
{
    public CorrectMemberUnitCommandValidator()
    {
        RuleFor(x => x.AssignmentId).NotEmpty();
        RuleFor(x => x.NewUnitId).NotEmpty().WithMessage("La nouvelle unité est requise.");
    }
}

public class CorrectMemberUnitCommandHandler(
    IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser,
    INotificationService notifications)
    : IRequestHandler<CorrectMemberUnitCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(CorrectMemberUnitCommand request, CancellationToken ct)
    {
        // Group-level only: correcting a placement can move a member into any unit, so it's a CG/super-admin action.
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Action réservée au Chef de Groupe.");

        var entity = await context.MemberAssignments.FindAsync([request.AssignmentId], ct);
        if (entity is null) return Result<bool>.Failure("Affectation introuvable.");
        if (entity.EndDate is not null) return Result<bool>.Failure("Seule une affectation active peut être corrigée.");

        if (entity.UnitId == request.NewUnitId)
            return Result<bool>.Failure("Le membre est déjà dans cette unité.");

        var newUnit = await context.Units.Where(u => u.Id == request.NewUnitId)
            .Select(u => new { u.Id, u.Name, u.UnitTypeId, u.IsActive }).FirstOrDefaultAsync(ct);
        if (newUnit is null) return Result<bool>.Failure("Unité introuvable.");
        if (!newUnit.IsActive) return Result<bool>.Failure("La nouvelle unité est inactive.");

        var oldUnit = await context.Units.Where(u => u.Id == entity.UnitId)
            .Select(u => new { u.Name, u.UnitTypeId }).FirstOrDefaultAsync(ct);

        // Role: keep it when the unit TYPE is unchanged; otherwise the old role is invalid → use the new type's
        // default youth role (same resolver as manual create / demande conversion).
        var newRoleId = entity.FunctionalRoleId;
        if (oldUnit is null || oldUnit.UnitTypeId != newUnit.UnitTypeId)
        {
            var resolved = await FunctionalRoleQueries.ResolveBaseRoleIdAsync(context, newUnit.UnitTypeId, ct);
            if (resolved is null)
                return Result<bool>.Failure("La nouvelle unité n'a aucune fonction par défaut. Définissez-en une d'abord.");
            newRoleId = resolved.Value;
        }

        // Readable BEFORE snapshot (names) — resolved before we repoint the assignment.
        var oldSnapshot = await AssignmentAudit.DescribeAsync(context, entity.MemberId, entity.UnitId, entity.TeamId,
            entity.FunctionalRoleId, entity.StartDate, entity.EndDate, ct);

        var oldUnitId = entity.UnitId;
        entity.UnitId = request.NewUnitId;
        entity.TeamId = null;                 // reset — old team belonged to the old unit
        entity.FunctionalRoleId = newRoleId;  // kept (same type) or new default (type changed)
        // StartDate is intentionally left unchanged (correction, not a new placement).

        // Keep any Passage that finalized this member INTO the wrong unit, but annotate it so the correction is
        // traceable (case 2: passage sent to the wrong unit). Case 1 (demande-accepted) has no passage → audit only.
        var passages = await context.Passages
            .Where(p => p.MemberId == entity.MemberId && p.FinalUnitId == oldUnitId)
            .ToListAsync(ct);
        if (passages.Count > 0)
        {
            var note = $"[Unité corrigée le {LebanonClock.Today:dd/MM/yyyy} : {oldUnit?.Name ?? "?"} → {newUnit.Name}]";
            foreach (var p in passages)
                p.CgNotes = string.IsNullOrWhiteSpace(p.CgNotes) ? note : $"{p.CgNotes}\n{note}";
        }

        // The « Entrée à … » progression recorded for the wrong unit moves with the member. Same branch → only the
        // unit changes; another branch → the stage becomes that branch's entrée (if it has one).
        var stages = await EntreeStageResolver.ResolveStagesForUnitsAsync(context, [oldUnitId, newUnit.Id], ct);
        var oldEntree = stages.GetValueOrDefault(oldUnitId);
        var newEntree = stages.GetValueOrDefault(newUnit.Id);
        if (oldEntree is not null)
        {
            var entrees = await context.MemberProgressions
                .Where(p => p.MemberId == entity.MemberId && p.UnitId == oldUnitId && p.ScoutStageId == oldEntree.Value)
                .ToListAsync(ct);
            foreach (var p in entrees)
            {
                p.UnitId = newUnit.Id;
                if (newEntree is not null) p.ScoutStageId = newEntree.Value;
            }
        }

        // The demande that created this member into the wrong unit: keep it truthful (review list, archive).
        var demandes = await context.Demandes
            .Where(d => d.CreatedMemberId == entity.MemberId && d.DecidedUnitId == oldUnitId)
            .ToListAsync(ct);
        foreach (var d in demandes) d.DecidedUnitId = newUnit.Id;

        await context.SaveChangesAsync(ct);

        // Tell both units' leaders (members.edit holders active in each unit), never the acting CG themselves.
        var memberName = await context.Members.Where(m => m.Id == entity.MemberId)
            .Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct) ?? "Un membre";
        var leaders = await context.MemberAssignments
            .Where(a => a.EndDate == null && (a.UnitId == oldUnitId || a.UnitId == newUnit.Id) && a.MemberId != entity.MemberId
                && a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == GNDJ.Domain.Enums.Permissions.MembersEdit))
            .Select(a => new { a.MemberId, a.UnitId }).ToListAsync(ct);
        var me = currentUser.MemberId;
        var newLeaders = leaders.Where(l => l.UnitId == newUnit.Id && l.MemberId != me).Select(l => l.MemberId).Distinct().ToList();
        var oldLeaders = leaders.Where(l => l.UnitId == oldUnitId && l.MemberId != me).Select(l => l.MemberId)
            .Distinct().Except(newLeaders).ToList();
        var link = $"/members/{entity.MemberId}";
        if (newLeaders.Count > 0)
            await notifications.NotifyMembersAsync(newLeaders, "info", $"Nouveau membre : {memberName}",
                $"{memberName} a été placé(e) dans {newUnit.Name} (correction, au lieu de {oldUnit?.Name ?? "une autre unité"}). Choisissez son équipe.", link, ct);
        if (oldLeaders.Count > 0)
            await notifications.NotifyMembersAsync(oldLeaders, "info", $"{memberName} n'est plus dans {oldUnit?.Name ?? "votre unité"}",
                $"Son unité a été corrigée : {memberName} est désormais dans {newUnit.Name}.", link, ct);

        var newSnapshot = await AssignmentAudit.DescribeAsync(context, entity.MemberId, entity.UnitId, entity.TeamId,
            entity.FunctionalRoleId, entity.StartDate, entity.EndDate, ct);
        await auditService.LogAsync("CorrectUnit", "MemberAssignment", entity.Id, oldValues: oldSnapshot,
            newValues: newSnapshot, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
