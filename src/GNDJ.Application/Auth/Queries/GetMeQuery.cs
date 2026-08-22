using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Queries;

// Returns the authenticated user's own profile + permissions + per-unit access list, for the frontend
// to drive role-based UI (sidebar, "Ma fiche", unit pages). Identity comes from the JWT, not the request.
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

        // Active assignments only → the unit/role labels the UI shows; permissions come from the JWT
        // (ICurrentUserService) rather than being re-derived here.
        var unitAccess = await _context.MemberAssignments
            .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
            .Select(a => new UnitAccessDto(a.UnitId, a.Unit.Name, a.FunctionalRole.Name,
                // Leadership role = its security profile grants members.edit (chef d'unité / ACU / CG …).
                a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == GNDJ.Domain.Enums.Permissions.MembersEdit),
                // Group-level role (CG/ACG) — grants all-units access; distinguishes the Maîtrise de Groupe
                // assignment from a real CU/ACU unit-leadership role.
                a.FunctionalRole.SecurityProfile.IsGroupLevel))
            .ToListAsync(cancellationToken);

        // Does this member lead a team (active assignment on a team with an IsTeamLeader role)? Drives the
        // "Séances" nav for a chef d'équipe who has no admin permission otherwise.
        var leadsTeam = await _context.MemberAssignments.AnyAsync(a =>
            a.MemberId == user.MemberId && a.EndDate == null && a.TeamId != null && a.FunctionalRole.IsTeamLeader,
            cancellationToken);

        return Result<MeResponse>.Success(new MeResponse(
            user.Id,
            user.MemberId,
            user.Email,
            user.Member.FirstName,
            user.Member.LastName,
            user.IsSuperAdmin,
            _currentUser.Permissions,
            unitAccess,
            user.MustChangePassword,
            leadsTeam
        ));
    }
}
