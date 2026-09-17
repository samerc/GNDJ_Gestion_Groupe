using System.Text.RegularExpressions;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.UpdateUsername;

// Changes a member's LOGIN username (User.Email — the synthetic "prenom.nom@scouts.gndj" identifier they sign in
// with). Used by the CG to fix a generated username or disambiguate duplicates. Only affects login: member-facing
// mail uses the contact email (PrimaryContactEmail / member / guardian), NOT this. Existing sessions are
// unaffected (auth claims don't carry the username). Access = super-admin / active leader of the member's unit /
// group manager (same rule as editing the member); the controller also gates on members.edit so youth can't reach it.
public record UpdateMemberUsernameCommand(Guid MemberId, string Username) : IRequest<Result<bool>>;

public partial class UpdateMemberUsernameCommandHandler(
    IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<UpdateMemberUsernameCommand, Result<bool>>
{
    // A login identifier in email shape: local@domain.tld, no spaces or angle brackets.
    [GeneratedRegex(@"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")]
    private static partial Regex UsernameRegex();

    public async ValueTask<Result<bool>> Handle(UpdateMemberUsernameCommand request, CancellationToken ct)
    {
        // Unit-scoped access (same rule as viewing/editing the member).
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        var username = request.Username?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(username)) return Result<bool>.Failure("L'identifiant est requis.");
        if (username.Length > 254) return Result<bool>.Failure("L'identifiant est trop long.");
        if (!UsernameRegex().IsMatch(username))
            return Result<bool>.Failure("L'identifiant doit être au format prenom.nom@scouts.gndj (sans espaces).");

        var user = await context.Users.FirstOrDefaultAsync(u => u.MemberId == request.MemberId && !u.IsDeleted, ct);
        if (user is null) return Result<bool>.Failure("Ce membre n'a pas de compte de connexion.");

        // Unique (case-insensitive) among other accounts — logins compare case-insensitively.
        var lower = username.ToLower();
        var taken = await context.Users.AnyAsync(u => u.Id != user.Id && !u.IsDeleted && u.Email.ToLower() == lower, ct);
        if (taken) return Result<bool>.Failure("Cet identifiant est déjà utilisé par un autre compte.");

        var old = user.Email;
        if (string.Equals(old, username, StringComparison.Ordinal)) return Result<bool>.Success(true); // no change

        user.Email = username;
        await context.SaveChangesAsync(ct);

        var name = await AuditNames.MemberAsync(context, request.MemberId, ct);
        await audit.LogAsync("UpdateUsername", "Member", request.MemberId,
            oldValues: new { Member = name, Username = old },
            newValues: new { Member = name, Username = username },
            cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
