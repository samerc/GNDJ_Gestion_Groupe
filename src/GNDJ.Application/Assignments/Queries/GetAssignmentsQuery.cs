using GNDJ.Application.Assignments.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Assignments.Queries;

// Paginated assignments, unit-scoped for non-super-admins. IsActive filter maps to EndDate null/not-null.
// Active assignments are listed first (open-ended, then most recent start).
public record GetAssignmentsQuery(
    Guid? MemberId, Guid? UnitId, Guid? TeamId, bool? IsActive,
    int Page = 1, int PageSize = 20
) : IRequest<PaginatedList<AssignmentDto>>;

public class GetAssignmentsQueryHandler : IRequestHandler<GetAssignmentsQuery, PaginatedList<AssignmentDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetAssignmentsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<PaginatedList<AssignmentDto>> Handle(GetAssignmentsQuery request, CancellationToken cancellationToken)
    {
        var query = _context.MemberAssignments
            .Include(a => a.Member)
            .Include(a => a.Unit)
            .Include(a => a.Team)
            .Include(a => a.FunctionalRole)
            .AsQueryable();

        // Unit-scoping for non-super-admins. EXCEPTION: when viewing ONE member you're already allowed to
        // see (your own record, or a member currently active in one of your units — same rule as the member
        // detail), return their FULL history across ALL units, so a CU sees the member's whole scouting path
        // (Ronde → Compagnie → …), not just the rows in their own unit. This is not a new data leak: you can
        // already open that member's profile. For list views (no MemberId), keep strict per-row unit-scoping.
        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            // Only leaders (members.edit) may see OTHER members' assignments. A read-only youth holds
            // assignments.view + their own unit in AuthorizedUnitIds, so a unit-only scope would show them
            // every co-member's assignment rows — restrict non-leaders to their OWN assignments.
            var isLeader = _currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit);
            var myId = _currentUser.MemberId;

            var canSeeFullHistory = request.MemberId.HasValue
                && (_currentUser.MemberId == request.MemberId.Value
                    || (isLeader && await _context.MemberAssignments.AnyAsync(a =>
                           a.MemberId == request.MemberId.Value
                           && a.EndDate == null
                           && authorizedUnitIds.Contains(a.UnitId), cancellationToken)));

            if (!canSeeFullHistory)
            {
                if (isLeader)
                    query = query.Where(a => authorizedUnitIds.Contains(a.UnitId));
                else
                    query = query.Where(a => a.MemberId == myId); // non-leader: own assignments only
            }
        }

        if (request.MemberId.HasValue)
            query = query.Where(a => a.MemberId == request.MemberId.Value);
        if (request.UnitId.HasValue)
            query = query.Where(a => a.UnitId == request.UnitId.Value);
        if (request.TeamId.HasValue)
            query = query.Where(a => a.TeamId == request.TeamId.Value);
        if (request.IsActive.HasValue)
        {
            if (request.IsActive.Value)
                query = query.Where(a => a.EndDate == null);
            else
                query = query.Where(a => a.EndDate != null);
        }

        var projected = query
            .OrderByDescending(a => a.EndDate == null)
            .ThenByDescending(a => a.StartDate)
            .Select(a => new AssignmentDto(
                a.Id, a.MemberId, a.Member.FirstName, a.Member.LastName,
                a.UnitId, a.Unit.Name, a.Unit.UnitTypeId,
                a.TeamId, a.Team != null ? a.Team.Name : null,
                a.FunctionalRoleId, a.FunctionalRole.Name,
                a.StartDate, a.EndDate, a.Notes,
                a.EndDate == null
            ));

        return await PaginatedList<AssignmentDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);
    }
}
