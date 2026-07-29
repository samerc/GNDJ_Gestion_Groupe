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

    public DeleteEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(DeleteEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberEmails.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Courriel introuvable.");

        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, entity.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès non autorisé.");

        _context.MemberEmails.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
