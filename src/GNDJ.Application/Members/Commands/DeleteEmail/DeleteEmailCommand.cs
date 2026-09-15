using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeleteEmail;

// Removes a member email. Access (IDOR guard, on the owning member): own profile / super-admin / active unit leader.
public record DeleteEmailCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteEmailCommandHandler : IRequestHandler<DeleteEmailCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;

    public DeleteEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    {
        _context = context;
        _currentUser = currentUser;
        _audit = audit;
    }

    public async ValueTask<Result<bool>> Handle(DeleteEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberEmails.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Courriel introuvable.");

        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, entity.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès non autorisé.");

        var member = await AuditNames.MemberAsync(_context, entity.MemberId, cancellationToken);
        var email = entity.Address;
        var memberId = entity.MemberId;
        _context.MemberEmails.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Member", memberId, oldValues: new { Member = member, Email = email }, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}
