using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.ResetMemberPassword;

public record ResetMemberPasswordResult(string Username, string TemporaryPassword);

public record ResetMemberPasswordCommand(Guid MemberId) : IRequest<Result<ResetMemberPasswordResult>>;

public class ResetMemberPasswordCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IPasswordHasher passwordHasher,
    IAuditService auditService
) : IRequestHandler<ResetMemberPasswordCommand, Result<ResetMemberPasswordResult>>
{
    public async ValueTask<Result<ResetMemberPasswordResult>> Handle(ResetMemberPasswordCommand request, CancellationToken ct)
    {
        // Access: super admin (CG) or an active leader of the member's unit.
        if (!currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = currentUser.AuthorizedUnitIds;
            var hasAccess = await context.MemberAssignments.AnyAsync(a =>
                a.MemberId == request.MemberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
            if (!hasAccess)
                return Result<ResetMemberPasswordResult>.Failure("Accès non autorisé à ce membre.");
        }

        var user = await context.Users.FirstOrDefaultAsync(u => u.MemberId == request.MemberId, ct);
        if (user is null)
            return Result<ResetMemberPasswordResult>.Failure("Ce membre n'a pas de compte utilisateur.");

        // Same temporary-password shape as member creation.
        var tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}";
        user.PasswordHash = passwordHasher.Hash(tempPassword);
        // Invalidate any active session and pending reset link.
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("ResetPassword", "User", user.Id, newValues: new { user.Email }, cancellationToken: ct);

        return Result<ResetMemberPasswordResult>.Success(new ResetMemberPasswordResult(user.Email, tempPassword));
    }
}
