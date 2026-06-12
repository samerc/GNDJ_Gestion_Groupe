using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Assignments.Commands.CreateAssignment;

public record CreateAssignmentCommand(
    Guid MemberId, Guid UnitId, Guid? TeamId, Guid FunctionalRoleId,
    DateOnly StartDate, DateOnly? EndDate, string? Notes
) : IRequest<Result<Guid>>;

public class CreateAssignmentCommandValidator : AbstractValidator<CreateAssignmentCommand>
{
    public CreateAssignmentCommandValidator()
    {
        RuleFor(x => x.MemberId).NotEmpty().WithMessage("Le membre est requis.");
        RuleFor(x => x.UnitId).NotEmpty().WithMessage("L'unité est requise.");
        RuleFor(x => x.FunctionalRoleId).NotEmpty().WithMessage("Le rôle est requis.");
        RuleFor(x => x.StartDate).NotEmpty().WithMessage("La date de début est requise.");
        RuleFor(x => x.EndDate).GreaterThan(x => x.StartDate)
            .When(x => x.EndDate.HasValue)
            .WithMessage("La date de fin doit être postérieure à la date de début.");
    }
}

public class CreateAssignmentCommandHandler : IRequestHandler<CreateAssignmentCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public CreateAssignmentCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<Guid>> Handle(CreateAssignmentCommand request, CancellationToken cancellationToken)
    {
        // Authorization: only super admin or a leader of the target unit may create assignments there.
        // Prevents privilege escalation (assigning oneself a role in an unauthorized unit).
        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<Guid>.Failure("Accès non autorisé à cette unité.");

        // Validate FK references exist
        var memberExists = await _context.Members.AnyAsync(m => m.Id == request.MemberId, cancellationToken);
        if (!memberExists)
            return Result<Guid>.Failure("Membre introuvable.");

        var unitExists = await _context.Units.AnyAsync(u => u.Id == request.UnitId, cancellationToken);
        if (!unitExists)
            return Result<Guid>.Failure("Unité introuvable.");

        var roleExists = await _context.FunctionalRoles.AnyAsync(r => r.Id == request.FunctionalRoleId, cancellationToken);
        if (!roleExists)
            return Result<Guid>.Failure("Rôle fonctionnel introuvable.");

        // Validate team belongs to unit
        if (request.TeamId.HasValue)
        {
            var teamBelongs = await _context.Teams.AnyAsync(t => t.Id == request.TeamId.Value && t.UnitId == request.UnitId, cancellationToken);
            if (!teamBelongs)
                return Result<Guid>.Failure("L'équipe sélectionnée n'appartient pas à cette unité.");
        }

        var entity = new MemberAssignment
        {
            MemberId = request.MemberId,
            UnitId = request.UnitId,
            TeamId = request.TeamId,
            FunctionalRoleId = request.FunctionalRoleId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Notes = request.Notes
        };

        _context.MemberAssignments.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "MemberAssignment", entity.Id,
            newValues: new { entity.MemberId, entity.UnitId, entity.FunctionalRoleId, entity.StartDate },
            cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}
