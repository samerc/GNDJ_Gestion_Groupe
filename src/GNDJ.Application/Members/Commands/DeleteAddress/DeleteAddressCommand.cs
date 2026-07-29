using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeleteAddress;

// Removes a member address. Access (IDOR guard, on the owning member): own profile / super-admin / active unit leader.
public record DeleteAddressCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteAddressCommandHandler : IRequestHandler<DeleteAddressCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public DeleteAddressCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(DeleteAddressCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberAddresses.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Adresse introuvable.");

        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, entity.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès non autorisé.");

        _context.MemberAddresses.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
