using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeleteMember;

public record DeleteMemberCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteMemberCommandHandler : IRequestHandler<DeleteMemberCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteMemberCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteMemberCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Members
            .Include(m => m.Assignments.Where(a => a.EndDate == null))
            .FirstOrDefaultAsync(m => m.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Membre introuvable.");

        if (entity.Assignments.Any())
            return Result<bool>.Failure("Impossible de supprimer un membre qui a des affectations actives.");

        _context.Members.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "Member", entity.Id, oldValues: new { entity.FirstName, entity.LastName }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
