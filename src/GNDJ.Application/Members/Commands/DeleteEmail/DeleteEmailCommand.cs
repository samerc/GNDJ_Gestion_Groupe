using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.DeleteEmail;

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

        if (!_currentUser.IsSuperAdmin && _currentUser.MemberId != entity.MemberId)
        {
            var canAccess = await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == entity.MemberId && a.EndDate == null && _currentUser.AuthorizedUnitIds.Contains(a.UnitId), cancellationToken);
            if (!canAccess) return Result<bool>.Failure("Accès non autorisé.");
        }

        _context.MemberEmails.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
