using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Members.Queries.MySwitchAccounts;

// One confirmed-sibling account the signed-in member can switch to: name + the login username to sign in with.
// Only siblings that actually HAVE a usable login (active, non-deleted user) are returned — you can't switch
// into an account that can't be signed into. Passwordless = the switch needs no password (same main email, no
// maîtrise / protected account on either side — FamilyAccess).
public record SwitchAccountDto(Guid MemberId, string Name, string Username, bool Passwordless = false);

// "Which sibling accounts can I switch to?" — AUTH-ONLY, resolves the caller's OWN member id server-side (never
// a client-supplied id), and returns the confirmed fratrie (shared SiblingGroupId, CG-approved). Deliberately
// NARROW exposure (name + login identifier of one's own confirmed siblings).
public record GetMySwitchAccountsQuery : IRequest<Result<IReadOnlyList<SwitchAccountDto>>>;

public class GetMySwitchAccountsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMySwitchAccountsQuery, Result<IReadOnlyList<SwitchAccountDto>>>
{
    public async ValueTask<Result<IReadOnlyList<SwitchAccountDto>>> Handle(GetMySwitchAccountsQuery request, CancellationToken ct)
    {
        if (currentUser.MemberId is not Guid memberId) return Result<IReadOnlyList<SwitchAccountDto>>.Success([]);
        var family = await FamilyAccess.LoadAsync(context, memberId, ct);
        var me = family.FirstOrDefault(f => f.MemberId == memberId);
        if (me is null) return Result<IReadOnlyList<SwitchAccountDto>>.Success([]);

        var list = family
            .Where(f => f.MemberId != memberId && !string.IsNullOrEmpty(f.Username))
            .Select(f => new SwitchAccountDto(f.MemberId, $"{f.FirstName} {f.LastName}", f.Username!,
                FamilyAccess.CanSwitchWithoutPassword(me, f)))
            .ToList();
        return Result<IReadOnlyList<SwitchAccountDto>>.Success(list);
    }
}
