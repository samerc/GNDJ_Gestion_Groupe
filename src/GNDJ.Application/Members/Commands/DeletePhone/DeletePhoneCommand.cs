using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeletePhone;

public record DeletePhoneCommand(Guid Id) : IRequest<Result<bool>>;

public class DeletePhoneCommandHandler : IRequestHandler<DeletePhoneCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public DeletePhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(DeletePhoneCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.MemberPhones.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Téléphone introuvable.");

        if (!_currentUser.IsSuperAdmin && _currentUser.MemberId != entity.MemberId)
        {
            var canAccess = await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && _currentUser.AuthorizedUnitIds.Contains(a.UnitId), cancellationToken);
            if (!canAccess) return Result<bool>.Failure("Accès non autorisé.");
        }

        _context.MemberPhones.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
