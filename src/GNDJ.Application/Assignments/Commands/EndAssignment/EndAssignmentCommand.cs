using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Assignments.Commands.EndAssignment;

public record EndAssignmentCommand(Guid Id, DateOnly EndDate) : IRequest<Result<bool>>;

public class EndAssignmentCommandHandler : IRequestHandler<EndAssignmentCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public EndAssignmentCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(EndAssignmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAssignments.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Affectation introuvable.");

        if (entity.EndDate is not null)
            return Result<bool>.Failure("Cette affectation est déjà terminée.");

        if (request.EndDate < entity.StartDate)
            return Result<bool>.Failure("La date de fin doit être postérieure à la date de début.");

        entity.EndDate = request.EndDate;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "MemberAssignment", entity.Id,
            oldValues: new { EndDate = (DateOnly?)null },
            newValues: new { entity.EndDate },
            cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
