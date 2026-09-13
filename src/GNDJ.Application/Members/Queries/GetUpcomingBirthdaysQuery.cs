using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries;

// Upcoming birthdays of the caller's members (leaders only). Unit-scoped: a CU sees their unit(s), a Chef de
// Groupe/super-admin sees everyone (a group-level login is granted all units). Youth never see it (no members.edit).
public record UpcomingBirthdayDto(
    Guid MemberId, string FirstName, string LastName, string? UnitName,
    DateOnly DateOfBirth, DateOnly NextBirthday, int TurningAge, int DaysUntil);

public record GetUpcomingBirthdaysQuery(int Days = 30) : IRequest<IReadOnlyList<UpcomingBirthdayDto>>;

public class GetUpcomingBirthdaysQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUpcomingBirthdaysQuery, IReadOnlyList<UpcomingBirthdayDto>>
{
    public async ValueTask<IReadOnlyList<UpcomingBirthdayDto>> Handle(GetUpcomingBirthdaysQuery request, CancellationToken ct)
    {
        // Leader-only (members.edit) — same signal as every cross-member read; a youth gets nothing.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(Permissions.MembersEdit))
            return [];

        var days = Math.Clamp(request.Days, 1, 90);
        var today = LebanonClock.Today;

        // Active members in scope, with a DOB. Bounded set (≤ group size), so we materialize a slim projection
        // and compute the next-birthday window in memory (month/day math across the year boundary + Feb 29 is
        // awkward in EF/SQL). A member with several active assignments is de-duplicated below.
        var q = context.MemberAssignments.Where(a => a.EndDate == null && !a.IsDeleted && a.Member.DateOfBirth != null);
        if (!currentUser.IsSuperAdmin)
            q = q.Where(a => currentUser.AuthorizedUnitIds.Contains(a.UnitId));

        var rows = await q
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.DateOfBirth, UnitName = a.Unit.Name })
            .ToListAsync(ct);

        var result = rows
            .GroupBy(r => r.MemberId)
            .Select(g => g.First())
            .Select(r =>
            {
                var dob = r.DateOfBirth!.Value;
                var next = NextBirthday(dob, today);
                return new UpcomingBirthdayDto(
                    r.MemberId, r.FirstName, r.LastName, r.UnitName,
                    dob, next, next.Year - dob.Year, next.DayNumber - today.DayNumber);
            })
            .Where(b => b.DaysUntil <= days)
            .OrderBy(b => b.DaysUntil).ThenBy(b => b.LastName)
            .ToList();

        return result;
    }

    // The member's next birthday on/after `today`. Feb-29 birthdays fall back to Feb-28 in non-leap years.
    private static DateOnly NextBirthday(DateOnly dob, DateOnly today)
    {
        DateOnly ThisYear(int year)
        {
            var day = dob.Month == 2 && dob.Day == 29 && !DateTime.IsLeapYear(year) ? 28 : dob.Day;
            return new DateOnly(year, dob.Month, day);
        }
        var candidate = ThisYear(today.Year);
        return candidate >= today ? candidate : ThisYear(today.Year + 1);
    }
}
