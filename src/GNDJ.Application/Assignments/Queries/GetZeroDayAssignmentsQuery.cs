using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Assignments.Queries;

// "Zero-day" assignments = start_date == end_date, a 1-day marker. These come from the WEBDEV migration where a
// historical placement had a real start but no end date: the member really passed through that unit/role but the
// duration is unknown, so it imported as a single day. This query powers the CG cleanup page where each one is
// reviewed and either DELETED (spurious/duplicate) or given real dates (which removes it from the list). Carries
// the unit/team/role ids so the "correct dates" action can reuse UpdateAssignmentCommand. Group-manager only.
public record ZeroDayAssignmentDto(
    Guid Id,
    Guid MemberId,
    string MemberName,
    string? CardNumber,
    Guid UnitId,
    string UnitCode,
    string UnitName,
    Guid? TeamId,
    string? TeamName,
    Guid RoleId,
    string RoleName,
    DateOnly Date,
    // Does the member currently hold an ACTIVE assignment somewhere? Helps decide: an active member with an old
    // undated marker is usually just missing history (keep or date it); an alumni-only member may be a duplicate.
    bool MemberHasActiveAssignment
);

public record GetZeroDayAssignmentsQuery() : IRequest<List<ZeroDayAssignmentDto>>;

public class GetZeroDayAssignmentsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetZeroDayAssignmentsQuery, List<ZeroDayAssignmentDto>>
{
    public async ValueTask<List<ZeroDayAssignmentDto>> Handle(GetZeroDayAssignmentsQuery request, CancellationToken ct)
    {
        // Group-wide data-cleanup view → super-admin / Chef de Groupe / ACG only.
        if (!MemberAccess.IsGroupManager(currentUser))
            return [];

        return await context.MemberAssignments
            .Where(a => !a.IsDeleted && a.EndDate != null && a.EndDate == a.StartDate && !a.Member.IsDeleted)
            .OrderBy(a => a.Member.LastName).ThenBy(a => a.Member.FirstName).ThenBy(a => a.StartDate)
            .Select(a => new ZeroDayAssignmentDto(
                a.Id,
                a.MemberId,
                (a.Member.FirstName + " " + a.Member.LastName).Trim(),
                a.Member.CardNumber,
                a.UnitId,
                a.Unit.Code,
                a.Unit.Name,
                a.TeamId,
                a.Team != null ? a.Team.Name : null,
                a.FunctionalRoleId,
                a.FunctionalRole.Name,
                a.StartDate,
                a.Member.Assignments.Any(x => !x.IsDeleted && x.EndDate == null)))
            .ToListAsync(ct);
    }
}
