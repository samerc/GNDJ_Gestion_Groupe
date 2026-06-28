using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
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
        RuleFor(x => x.Notes).MaximumLength(2000);
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

        if (request.TeamId.HasValue)
        {
            var teamBelongs = await _context.Teams.AnyAsync(t => t.Id == request.TeamId.Value && t.UnitId == request.UnitId, cancellationToken);
            if (!teamBelongs)
                return Result<bool>.Failure("L'équipe sélectionnée n'appartient pas à cette unité.");
        }

        var oldValues = new { entity.UnitId, entity.TeamId, entity.FunctionalRoleId, entity.StartDate, entity.EndDate };

        entity.UnitId = request.UnitId;
        entity.TeamId = request.TeamId;
        entity.FunctionalRoleId = request.FunctionalRoleId;
        entity.StartDate = request.StartDate;
        entity.EndDate = request.EndDate;
        entity.Notes = request.Notes;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "MemberAssignment", entity.Id, oldValues: oldValues,
            newValues: new { entity.UnitId, entity.TeamId, entity.FunctionalRoleId, entity.StartDate, entity.EndDate },
            cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
