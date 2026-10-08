using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Assignments.Commands.UpdateAssignment;

// Edits an existing assignment. Authorization is checked against the assignment's CURRENT unit
// (before the change); team-belongs-to-unit is re-validated against the new unit.
public record UpdateAssignmentCommand(
    Guid Id, Guid UnitId, Guid? TeamId, Guid FunctionalRoleId,
    DateOnly StartDate, DateOnly? EndDate, string? Notes
) : IRequest<Result<bool>>;

public class UpdateAssignmentCommandValidator : AbstractValidator<UpdateAssignmentCommand>
{
    public UpdateAssignmentCommandValidator()
    {
        RuleFor(x => x.UnitId).NotEmpty().WithMessage("L'unité est requise.");
        RuleFor(x => x.FunctionalRoleId).NotEmpty().WithMessage("La fonction est requise.");
        RuleFor(x => x.StartDate).NotEmpty().WithMessage("La date de début est requise.");
        RuleFor(x => x.EndDate).GreaterThan(x => x.StartDate)
            .When(x => x.EndDate.HasValue)
            .WithMessage("La date de fin doit être postérieure à la date de début.");
        RuleFor(x => x.Notes).MaximumLength(2000).NoHtml();
    }
}

public class UpdateAssignmentCommandHandler : IRequestHandler<UpdateAssignmentCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public UpdateAssignmentCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(UpdateAssignmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAssignments.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Affectation introuvable.");

        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(entity.UnitId))
            return Result<bool>.Failure("Accès non autorisé à cette unité.");

        // Also authorize the TARGET unit: without this a leader could move a member (in a unit they manage)
        // into ANY unit — including one they don't lead, with any role — since only the current unit was
        // checked above. CreateAssignment guards the target the same way; a real branch move goes through the
        // passage flow, not this edit.
        if (!_currentUser.IsSuperAdmin && request.UnitId != entity.UnitId && !_currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<bool>.Failure("Accès non autorisé à l'unité de destination.");

        // Validate the target unit/role exist so a bad id returns a friendly 400 instead of a raw 500
        // (FK violation) — matters for bulk reassignment where a stale/typo id is easy to hit.
        if (!await _context.Units.AnyAsync(u => u.Id == request.UnitId, cancellationToken))
            return Result<bool>.Failure("Unité introuvable.");
        if (!await _context.FunctionalRoles.AnyAsync(r => r.Id == request.FunctionalRoleId, cancellationToken))
            return Result<bool>.Failure("Fonction introuvable.");

        if (request.TeamId.HasValue)
        {
            var teamBelongs = await _context.Teams.AnyAsync(t => t.Id == request.TeamId.Value && t.UnitId == request.UnitId, cancellationToken);
            if (!teamBelongs)
                return Result<bool>.Failure("L'équipe sélectionnée n'appartient pas à cette unité.");
        }

        // Readable BEFORE snapshot (names, not GUIDs) — resolved before we mutate the ids.
        var oldSnapshot = await AssignmentAudit.DescribeAsync(_context, entity.MemberId, entity.UnitId, entity.TeamId,
            entity.FunctionalRoleId, entity.StartDate, entity.EndDate, cancellationToken);

        // Becoming chef d'unité (new function or new unit on an active post) replaces the current one.
        var becomesHead = request.EndDate is null
            && (request.FunctionalRoleId != entity.FunctionalRoleId || request.UnitId != entity.UnitId);

        entity.UnitId = request.UnitId;
        entity.TeamId = request.TeamId;
        entity.FunctionalRoleId = request.FunctionalRoleId;
        entity.StartDate = request.StartDate;
        entity.EndDate = request.EndDate;
        entity.Notes = request.Notes;

        var replaced = becomesHead
            ? await GNDJ.Application.Common.HeadReplacement.EndOtherHeadsAsync(_context, entity.UnitId, entity.FunctionalRoleId,
                entity.MemberId, entity.StartDate, cancellationToken)
            : [];
        await _context.SaveChangesAsync(cancellationToken);
        if (replaced.Count > 0)
            await _auditService.LogAsync("EndAssignment", "MemberAssignment", entity.Id,
                newValues: new { Reason = "Remplacé(e) comme chef d'unité", Replaced = replaced }, cancellationToken: cancellationToken);
        var newSnapshot = await AssignmentAudit.DescribeAsync(_context, entity.MemberId, entity.UnitId, entity.TeamId,
            entity.FunctionalRoleId, entity.StartDate, entity.EndDate, cancellationToken);
        await _auditService.LogAsync("Update", "MemberAssignment", entity.Id, oldValues: oldSnapshot,
            newValues: newSnapshot, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
