using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.SetPrimaryContactEmail;

// Sets (or clears, with null/empty) the member's designated "primary contact email" — the recipient used
// for member-facing mail (password reset). Access = super-admin or an active leader of the member's unit.
public record SetPrimaryContactEmailCommand(Guid MemberId, string? Email) : IRequest<Result<bool>>;

public class SetPrimaryContactEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetPrimaryContactEmailCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetPrimaryContactEmailCommand request, CancellationToken ct)
    {
        // Unit-scoped access (same rule as viewing/editing the member).
        if (!await MemberAccess.CanAccessMemberAsync(context, currentUser, request.MemberId, ct))
            return Result<bool>.Failure("Accès non autorisé à ce membre.");

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");

        var email = request.Email?.Trim();
        if (!string.IsNullOrEmpty(email))
        {
            // The chosen address must be one of the member's own or a linked guardian's emails (case-insensitive —
            // same rule as the self-service SetMyPrimaryContactEmail, so "Marie@Gmail.com" matches the stored one).
            var lower = email.ToLower();
            var isMemberEmail = await context.MemberEmails.AnyAsync(e => e.MemberId == request.MemberId && !e.IsDeleted && e.Address.ToLower() == lower, ct);
            var isGuardianEmail = await context.GuardianEmails.AnyAsync(e => !e.IsDeleted && e.Address.ToLower() == lower
                && e.Guardian.Links.Any(l => l.MemberId == request.MemberId && !l.IsDeleted), ct);
            if (!isMemberEmail && !isGuardianEmail)
                return Result<bool>.Failure("Ce courriel ne figure pas sur la fiche du membre.");
        }

        var oldEmail = member.PrimaryContactEmail;
        member.PrimaryContactEmail = string.IsNullOrEmpty(email) ? null : email;
        await context.SaveChangesAsync(ct);
        var name = await AuditNames.MemberAsync(context, member.Id, ct);
        await audit.LogAsync("Update", "Member", member.Id,
            oldValues: new { Member = name, PrimaryContactEmail = oldEmail },
            newValues: new { Member = name, member.PrimaryContactEmail },
            cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
