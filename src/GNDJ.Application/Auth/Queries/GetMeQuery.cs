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

        // Read-only: this handler never mutates user/member, so skip change-tracking (this is the hottest
        // authenticated call — invoked by /auth/bootstrap on every first paint and token refresh).
        var user = await _context.Users
            .Include(u => u.Member)
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == _currentUser.UserId, cancellationToken);

        if (user is null)
            return Result<MeResponse>.Failure("Utilisateur introuvable.");

        // Active assignments only → the unit/role labels the UI shows PLUS the two leadership signals
        // (leadsTeam / isMaitrise), all in ONE query. Previously leadsTeam and isMaitrise were two extra
        // AnyAsync round-trips over this exact same set; folding them into the projection and computing them
        // in memory removes 2 sequential DB round-trips from every bootstrap/refresh. Permissions come from
        // the JWT (ICurrentUserService), not re-derived here.
        var activeAssignments = await _context.MemberAssignments
            .Where(a => a.MemberId == user.MemberId && a.EndDate == null)
            .Select(a => new
            {
                a.UnitId,
                UnitName = a.Unit.Name,
                RoleName = a.FunctionalRole.Name,
                // Leadership role = its security profile grants members.edit (chef d'unité / ACU / CG …).
                IsLeader = a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == GNDJ.Domain.Enums.Permissions.MembersEdit),
                // Group-level role (CG/ACG) — grants all-units access; distinguishes the Maîtrise de Groupe
                // assignment from a real CU/ACU unit-leadership role.
                a.FunctionalRole.SecurityProfile.IsGroupLevel,
                // Chef d'équipe (active assignment on a team with an IsTeamLeader role) → drives the "Réunions" nav.
                LeadsTeam = a.TeamId != null && a.FunctionalRole.IsTeamLeader,
                // Maîtrise (leadership) role → drives whether their cotisation is the maîtrise one.
                a.FunctionalRole.IsMaitrise,
            })
            .ToListAsync(cancellationToken);

        var unitAccess = activeAssignments
            .Select(a => new UnitAccessDto(a.UnitId, a.UnitName, a.RoleName, a.IsLeader, a.IsGroupLevel))
            .ToList();

        var leadsTeam = activeAssignments.Any(a => a.LeadsTeam);
        var isMaitrise = activeAssignments.Any(a => a.IsMaitrise);

        // Leader first-login contact check: a real leader (holds a leadership OR group-level role — NOT a
        // super-admin by flag) who hasn't confirmed their personal email + phone is prompted once to verify them.
        var isLeader = unitAccess.Any(u => u.IsLeader || u.IsGroupLevel);
        var needsContactVerification = isLeader && !user.IsSuperAdmin && user.Member.ContactVerifiedAt is null;
        // Unified contact-review popup (EVERYONE, not just leaders): shown once until the member confirms their
        // household contacts. Excludes super-admins (they have no personal household to review). Skippable per
        // session (client-side); ContactReviewedAt is stamped only on « Confirmer ».
        var needsContactReview = !user.IsSuperAdmin && user.Member.ContactReviewedAt is null;
        // Prefill = the member's OWN email/phone (primary first), never a guardian's — so we don't invite them to
        // "confirm" a parent's; empty means they must type their personal one.
        string? suggestedEmail = null, suggestedPhoneCountry = null, suggestedPhone = null;
        if (needsContactVerification)
        {
            suggestedEmail = await _context.MemberEmails.Where(e => e.MemberId == user.MemberId && !e.IsDeleted)
                .OrderByDescending(e => e.IsPrimary).ThenBy(e => e.CreatedAt).Select(e => e.Address).FirstOrDefaultAsync(cancellationToken);
            var phone = await _context.MemberPhones.Where(p => p.MemberId == user.MemberId && !p.IsDeleted)
                .OrderByDescending(p => p.IsPrimary).ThenBy(p => p.CreatedAt)
                .Select(p => new { p.CountryCode, p.Number }).FirstOrDefaultAsync(cancellationToken);
            suggestedPhoneCountry = phone?.CountryCode;
            suggestedPhone = phone?.Number;
        }

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
            leadsTeam,
            user.Member.IsOnHold,
            needsContactVerification,
            suggestedEmail,
            suggestedPhoneCountry,
            suggestedPhone,
            user.Member.OnboardingSeenAt != null,
            isMaitrise,
            needsContactReview,
            user.Member.AppInstalledAt != null
        ));
    }
}
