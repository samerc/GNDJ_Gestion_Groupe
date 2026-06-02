using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Queries;

public record GetMeQuery : IRequest<Result<MeResponse>>;

public class GetMeQueryHandler : IRequestHandler<GetMeQuery, Result<MeResponse>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetMeQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<MeResponse>> Handle(GetMeQuery request, CancellationToken cancellationToken)
    {
        if (_currentUser.UserId is null)
            return Result<MeResponse>.Failure("Non authentifié.");

        var user = await _context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Id == _currentUser.UserId, cancellationToken);

        if (user is null)
            return Result<MeResponse>.Failure("Utilisateur introuvable.");

        var unitAccess = await _context.MemberAssignments
            .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
            .Select(a => new UnitAccessDto(a.UnitId, a.Unit.Name, a.FunctionalRole.Name))
            .ToListAsync(cancellationToken);

        return Result<MeResponse>.Success(new MeResponse(
            user.Id,
            user.MemberId,
            user.Email,
            user.Member.FirstName,
            user.Member.LastName,
            user.IsSuperAdmin,
            _currentUser.Permissions,
            unitAccess
        ));
    }
}
