using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Members.Queries.MyTodo;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries.MyFamily;

// « Ma famille »: the signed-in member + their CONFIRMED siblings, each with what is left to do this year
// (same to-do as « Ma rentrée »), so a parent sees every child on one screen. AUTH-ONLY, own family resolved
// server-side. A protected sibling (maîtrise / group function / delegated access / super-admin) shows the name
// only (Todo = null). Empty list when the member has no confirmed fratrie.
public record FamilyChildDto(Guid MemberId, string Name, string? UnitName, bool IsMe, bool HasLogin,
    bool Protected, bool Passwordless, MyTodoDto? Todo);

public record GetMyFamilyQuery : IRequest<IReadOnlyList<FamilyChildDto>>;

public class GetMyFamilyQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMyFamilyQuery, IReadOnlyList<FamilyChildDto>>
{
    public async ValueTask<IReadOnlyList<FamilyChildDto>> Handle(GetMyFamilyQuery request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return [];
        var family = await FamilyAccess.LoadAsync(context, memberId, ct);
        var me = family.FirstOrDefault(f => f.MemberId == memberId);
        if (me is null || family.Count < 2) return [];

        var ids = family.Select(f => f.MemberId).ToList();
        // Current unit (most senior active post first is not needed here: any active post's unit).
        var units = (await context.MemberAssignments
                .Where(a => ids.Contains(a.MemberId) && a.EndDate == null)
                .Select(a => new { a.MemberId, a.Unit.Name, a.FunctionalRole.IsMaitrise })
                .ToListAsync(ct))
            .GroupBy(a => a.MemberId)
            .ToDictionary(g => g.Key, g => g.OrderBy(a => a.IsMaitrise).Select(a => a.Name).First());

        var result = new List<FamilyChildDto>();
        foreach (var f in family)
        {
            var isMe = f.MemberId == memberId;
            // The caller's own to-do is always shown; a protected sibling's never is.
            var todo = isMe || !f.Protected ? await MemberTodo.ComputeAsync(context, f.MemberId, ct) : null;
            result.Add(new FamilyChildDto(f.MemberId, $"{f.FirstName} {f.LastName}", units.GetValueOrDefault(f.MemberId),
                isMe, f.UserId is not null, f.Protected, !isMe && FamilyAccess.CanSwitchWithoutPassword(me, f), todo));
        }
        return result;
    }
}
