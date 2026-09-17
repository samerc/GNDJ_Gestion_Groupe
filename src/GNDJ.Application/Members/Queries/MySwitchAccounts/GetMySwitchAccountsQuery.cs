using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries.MySwitchAccounts;

// One confirmed-sibling account the signed-in member can switch to: name + the login username to sign in with.
// Only siblings that actually HAVE a usable login (active, non-deleted user) are returned — you can't switch
// into an account that can't be signed into.
public record SwitchAccountDto(Guid MemberId, string Name, string Username);

// "Which sibling accounts can I switch to?" — AUTH-ONLY, resolves the caller's OWN member id server-side (never
// a client-supplied id), and returns the confirmed fratrie (shared SiblingGroupId, CG-approved). This is a
// deliberately NARROW exposure (name + login identifier of one's own confirmed siblings) that powers the
// account switcher: switching still requires the sibling's password the first time on a device (the token
// pool then remembers it), so listing the username here doesn't grant access on its own.
public record GetMySwitchAccountsQuery : IRequest<Result<IReadOnlyList<SwitchAccountDto>>>;

public class GetMySwitchAccountsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMySwitchAccountsQuery, Result<IReadOnlyList<SwitchAccountDto>>>
{
    public async ValueTask<Result<IReadOnlyList<SwitchAccountDto>>> Handle(GetMySwitchAccountsQuery request, CancellationToken ct)
    {
        var memberId = currentUser.MemberId;
        if (memberId is null) return Result<IReadOnlyList<SwitchAccountDto>>.Success([]);

        var groupId = await context.Members
            .Where(m => m.Id == memberId)
            .Select(m => m.SiblingGroupId)
            .FirstOrDefaultAsync(ct);
        if (groupId is null) return Result<IReadOnlyList<SwitchAccountDto>>.Success([]);

        // Confirmed siblings (same group, not me, not deleted) that have a usable login account, with that
        // account's username (the synthetic prenom.nom@scouts.gndj the parent signs in with).
        var siblings = await context.Members
            .Where(m => m.SiblingGroupId == groupId && m.Id != memberId && !m.IsDeleted)
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.DateOfBirth,
                Username = context.Users
                    .Where(u => u.MemberId == m.Id && u.IsActive && !u.IsDeleted)
                    .Select(u => u.Email)
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        // Order eldest-first (EF can't translate the DateOnly null-coalesce in ORDER BY, so sort in memory).
        var ordered = siblings
            .Where(s => !string.IsNullOrEmpty(s.Username))
            .OrderBy(s => s.DateOfBirth ?? DateOnly.MaxValue).ThenBy(s => s.LastName)
            .Select(s => new SwitchAccountDto(s.Id, $"{s.FirstName} {s.LastName}", s.Username!))
            .ToList();

        return Result<IReadOnlyList<SwitchAccountDto>>.Success(ordered);
    }
}
