using FluentValidation;
using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.LoginCode;

// Passwordless login — step 2: verify the 6-digit code and, on success, sign the member in EXACTLY like a
// password login (same permissions/units, same token pair, same RememberMe window). Additive to the password
// path — passwords are never removed. Invalid/expired code → a generic failure (the controller returns 400,
// not 401, so the client's session-expired interceptor is not triggered).
public record VerifyLoginCodeCommand(string Username, string Code, bool RememberMe = false) : IRequest<Result<AuthResponse>>;

public class VerifyLoginCodeCommandValidator : AbstractValidator<VerifyLoginCodeCommand>
{
    public VerifyLoginCodeCommandValidator()
    {
        RuleFor(x => x.Username).NotEmpty().MaximumLength(254);
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").Length(4, 8);
    }
}

public class VerifyLoginCodeCommandHandler(
    IApplicationDbContext context,
    ITokenService tokenService,
    IAuditService auditService,
    IPasswordHasher passwordHasher,
    IMaintenanceProvider maintenance,
    ICurrentUserService device
) : IRequestHandler<VerifyLoginCodeCommand, Result<AuthResponse>>
{
    public async ValueTask<Result<AuthResponse>> Handle(VerifyLoginCodeCommand request, CancellationToken ct)
    {
        var username = (request.Username ?? "").Trim().ToLowerInvariant();
        var user = await context.Users
            .Include(u => u.Member)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == username && u.IsActive, ct);

        // Validate the code: account exists + has a live code that matches (hashed) and hasn't expired.
        var codeValid = user?.Member is not null
            && user.LoginCode is not null
            && user.LoginCodeExpiry is not null
            && user.LoginCodeExpiry > DateTime.UtcNow
            && user.LoginCode == passwordHasher.HashToken((request.Code ?? "").Trim());

        if (user is null || user.Member is null || !codeValid)
        {
            await auditService.LogAsync("LoginFailed", "User", user?.Id,
                newValues: new { Email = request.Username, Reason = "Code invalide ou expiré", Method = "Code", Portal = "Espace membres" },
                cancellationToken: ct);
            return Result<AuthResponse>.Failure("Code invalide ou expiré.");
        }

        // Single-use: clear the code immediately (even before issuing tokens).
        user.LoginCode = null;
        user.LoginCodeExpiry = null;

        // Maintenance gate — identical to the password login: only a super-admin may sign in while the site /
        // members app is under maintenance.
        if (!user.IsSuperAdmin)
        {
            var maint = await maintenance.GetAsync(ct);
            if (maint.Site || maint.Membres)
            {
                await context.SaveChangesAsync(ct); // persist the cleared code
                await auditService.LogAsync("LoginBlocked", "User", user.Id,
                    newValues: new { user.Email, Reason = "Maintenance", Method = "Code", Portal = "Espace membres" },
                    cancellationToken: ct);
                return Result<AuthResponse>.Failure(string.IsNullOrWhiteSpace(maint.Message)
                    ? "Le site est en maintenance. Merci de réessayer plus tard."
                    : maint.Message);
            }
        }

        var (permissions, unitIds) = await AuthAccess.LoadAsync(context, user.MemberId, user.IsSuperAdmin, ct);

        // A new device session: other devices of this account stay signed in.
        var (sessionId, refreshToken) = await UserSessions.StartAsync(
            context, tokenService, passwordHasher, device, user.Id, request.RememberMe, ct);
        var accessToken = tokenService.GenerateAccessToken(user, permissions, unitIds, sessionId);

        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Login", "User", user.Id,
            newValues: new { user.Email, MemberId = user.MemberId, Name = $"{user.Member.FirstName} {user.Member.LastName}", Method = "Code", Portal = "Espace membres" },
            cancellationToken: ct);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, user.MemberId, user.Email, accessToken, refreshToken,
            DateTime.UtcNow.AddMinutes(15), permissions, user.MustChangePassword
        ));
    }
}
