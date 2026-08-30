using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// ── Super-admin grant / revoke ──
// Super-admin is a manual flag on the login account (User.IsSuperAdmin), independent of any fonction/profile —
// it grants ALL permissions + ALL units (see AuthAccess.LoadAsync). There was no UI to set it (DB-only), so this
// exposes grant/revoke. ONLY an existing super-admin may manage it (checked in-handler, no permission maps to it).
// The change takes effect on the target's next login / token refresh (the flag is read when the token is issued).

public record SuperAdminDto(Guid MemberId, string Name, string? Email, string? UnitCode);

public record GetSuperAdminsQuery : IRequest<Result<IReadOnlyList<SuperAdminDto>>>;

public class GetSuperAdminsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetSuperAdminsQuery, Result<IReadOnlyList<SuperAdminDto>>>
{
    public async ValueTask<Result<IReadOnlyList<SuperAdminDto>>> Handle(GetSuperAdminsQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin) return Result<IReadOnlyList<SuperAdminDto>>.Failure("Accès non autorisé.");

        var rows = await context.Users
            .Where(u => u.IsSuperAdmin)
            .Select(u => new SuperAdminDto(
                u.MemberId,
                u.Member.FirstName + " " + u.Member.LastName,
                u.Email,
                u.Member.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault()))
            .ToListAsync(ct);

        return Result<IReadOnlyList<SuperAdminDto>>.Success(rows.OrderBy(x => x.Name).ToList());
    }
}

// Grant=true → make the member's account a super-admin; Grant=false → revoke. Guards: caller must be super-admin;
// the member must have a login account to grant; the LAST super-admin can never be revoked (no lock-out).
public record SetSuperAdminCommand(Guid MemberId, bool Grant) : IRequest<Result<bool>>;

public class SetSuperAdminCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetSuperAdminCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetSuperAdminCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin) return Result<bool>.Failure("Accès non autorisé.");

        var user = await context.Users.FirstOrDefaultAsync(u => u.MemberId == request.MemberId, ct);
        if (user is null) return Result<bool>.Failure("Ce membre n'a pas de compte de connexion.");

        if (user.IsSuperAdmin == request.Grant) return Result<bool>.Success(true); // no-op

        if (!request.Grant)
        {
            var count = await context.Users.CountAsync(u => u.IsSuperAdmin, ct);
            if (count <= 1) return Result<bool>.Failure("Impossible de retirer le dernier super-administrateur.");
        }

        user.IsSuperAdmin = request.Grant;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(request.Grant ? "GrantSuperAdmin" : "RevokeSuperAdmin", "User", user.Id,
            newValues: new { user.MemberId, IsSuperAdmin = request.Grant }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
