using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Assignments.Commands.DeleteAssignment;

public record DeleteAssignmentCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteAssignmentCommandHandler : IRequestHandler<DeleteAssignmentCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteAssignmentCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteAssignmentCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAssignments.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Affectation introuvable.");

        _context.MemberAssignments.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "MemberAssignment", entity.Id,
            oldValues: new { entity.MemberId, entity.UnitId, entity.FunctionalRoleId },
            cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
