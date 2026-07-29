using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Commands.ResetMemberPassword;

// Returned once so the CG/leader can relay the new credentials. SentToEmail = the address the temp
// password was emailed to (null if the member has no email on file — creds are shown on screen only).
public record ResetMemberPasswordResult(string Username, string TemporaryPassword, string? SentToEmail);

// CG/leader resets a member's login: sets a fresh temp password, invalidates any active session +
// pending reset link, and emails the temp password to the member's contact email (primary contact
// email → own email → a guardian's). Access = super-admin or an active leader of the member's unit.
public record ResetMemberPasswordCommand(Guid MemberId) : IRequest<Result<ResetMemberPasswordResult>>;

public class ResetMemberPasswordCommandHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IPasswordHasher passwordHasher,
    IAuditService auditService,
    IEmailQueue emailQueue
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

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId, ct);
        if (member is null)
            return Result<ResetMemberPasswordResult>.Failure("Membre introuvable.");

        var user = await context.Users.FirstOrDefaultAsync(u => u.MemberId == request.MemberId, ct);
        if (user is null)
            return Result<ResetMemberPasswordResult>.Failure("Ce membre n'a pas de compte utilisateur.");

        // Same temporary-password shape as member creation. The member must change it after logging in.
        var tempPassword = $"Scout{DateTime.UtcNow.Year}!{Random.Shared.Next(100, 999)}";
        user.PasswordHash = await passwordHasher.HashAsync(tempPassword);
        // Invalidate any active session and pending reset link.
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("ResetPassword", "User", user.Id, newValues: new { user.Email }, cancellationToken: ct);

        // Resolve the contact email and queue the temp password there (best-effort, background-sent).
        var resolver = await ContactEmailResolver.LoadAsync(context, [member.Id], ct);
        var sentTo = resolver.Resolve(member.Id, member.PrimaryContactEmail);
        if (!string.IsNullOrWhiteSpace(sentTo))
        {
            var baseUrl = (await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct)
                ?? "http://localhost:5173").TrimEnd('/');
            emailQueue.Enqueue(new EmailJob("member_password_reset", sentTo!, new Dictionary<string, string>
            {
                ["memberName"] = $"{member.FirstName} {member.LastName}".Trim(),
                ["username"] = user.Email,
                ["tempPassword"] = tempPassword,
                ["loginUrl"] = baseUrl,
            }));
        }

        return Result<ResetMemberPasswordResult>.Success(new ResetMemberPasswordResult(user.Email, tempPassword, sentTo));
    }
}
