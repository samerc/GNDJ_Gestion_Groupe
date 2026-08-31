using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Sessions;

// "Sessions actives" — a super-admin view of who currently holds a live session, plus the ability to
// force-disconnect one. The app uses a stateless 15-min access token + a SINGLE rotating refresh token
// per account (User.RefreshToken / ApplicantAccount.RefreshToken, SHA-256 hashed, 7-day). So a "session"
// = an account with a non-null, unexpired refresh token; there is no per-device list (one row per account).
// "En ligne" is derived from LastActivityAt (stamped on login + every refresh, a ~15-min heartbeat).
// Disconnect = clear the refresh token: the account can no longer refresh and its access token dies within
// ≤15 minutes (revocation is "≤15 min", never instant — inherent to stateless JWT).

// One active session row (member/chef OR parent-portal account).
public record ActiveSessionDto(
    string Kind,            // "member" | "applicant"
    Guid Id,                // User.Id or ApplicantAccount.Id (the disconnect target)
    string Name,
    string? Detail,         // login email / contact email — identifies the account
    DateTime? LoginAt,      // original sign-in (LastLoginAt)
    DateTime? LastActivityAt,
    DateTime? ExpiresAt,    // refresh-token expiry — the session's hard ceiling
    bool IsOnline);         // last activity within the online window

public record ActiveSessionsDto(
    List<ActiveSessionDto> Members,
    List<ActiveSessionDto> Applicants,
    int OnlineWindowMinutes);

public record GetActiveSessionsQuery() : IRequest<Result<ActiveSessionsDto>>;

public class GetActiveSessionsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetActiveSessionsQuery, Result<ActiveSessionsDto>>
{
    // A session is considered "online" if it refreshed/logged in within this window (the refresh heartbeat
    // is ~15 min, so 20 gives a little slack for a client that just went idle).
    private const int OnlineWindowMinutes = 20;

    public async ValueTask<Result<ActiveSessionsDto>> Handle(GetActiveSessionsQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            throw new UnauthorizedAccessException("La gestion des sessions est réservée au super-administrateur.");

        var now = DateTime.UtcNow;
        var cutoff = now.AddMinutes(-OnlineWindowMinutes);

        // Members / chefs: join the login account to its Member for a display name (Member is soft-delete filtered).
        var memberRows = await (
            from u in context.Users
            where u.RefreshToken != null && u.RefreshTokenExpiry > now && u.IsActive
            join m in context.Members on u.MemberId equals m.Id
            select new
            {
                u.Id, m.FirstName, m.LastName, u.Email,
                u.LastLoginAt, u.LastActivityAt, u.RefreshTokenExpiry
            }).ToListAsync(ct);

        var members = memberRows
            .Select(r => new ActiveSessionDto(
                "member", r.Id,
                $"{r.FirstName} {r.LastName}".Trim(),
                r.Email, r.LastLoginAt, r.LastActivityAt, r.RefreshTokenExpiry,
                (r.LastActivityAt ?? r.LastLoginAt) >= cutoff))
            .OrderByDescending(s => s.LastActivityAt ?? s.LoginAt)
            .ToList();

        // Parent-portal accounts.
        var applicantRows = await context.ApplicantAccounts
            .Where(a => a.RefreshToken != null && a.RefreshTokenExpiry > now && a.IsActive)
            .Select(a => new { a.Id, a.ContactName, a.Email, a.LastLoginAt, a.LastActivityAt, a.RefreshTokenExpiry })
            .ToListAsync(ct);

        var applicants = applicantRows
            .Select(a => new ActiveSessionDto(
                "applicant", a.Id,
                string.IsNullOrWhiteSpace(a.ContactName) ? a.Email : a.ContactName!,
                a.Email, a.LastLoginAt, a.LastActivityAt, a.RefreshTokenExpiry,
                (a.LastActivityAt ?? a.LastLoginAt) >= cutoff))
            .OrderByDescending(s => s.LastActivityAt ?? s.LoginAt)
            .ToList();

        return Result<ActiveSessionsDto>.Success(new ActiveSessionsDto(members, applicants, OnlineWindowMinutes));
    }
}

// Force-disconnect one account by clearing its refresh token (access dies within ≤15 min).
public record DisconnectSessionCommand(string Kind, Guid Id) : IRequest<Result<bool>>;

public class DisconnectSessionCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<DisconnectSessionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DisconnectSessionCommand request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin)
            throw new UnauthorizedAccessException("La gestion des sessions est réservée au super-administrateur.");

        if (request.Kind == "applicant")
        {
            var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == request.Id, ct);
            if (account is null) return Result<bool>.Failure("Compte introuvable.");
            account.RefreshToken = null;
            account.RefreshTokenExpiry = null;
            await context.SaveChangesAsync(ct);
            await audit.LogAsync("DisconnectSession", "ApplicantAccount", account.Id, null, new { account.Email }, ct);
            return Result<bool>.Success(true);
        }

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == request.Id, ct);
        if (user is null) return Result<bool>.Failure("Compte introuvable.");
        user.RefreshToken = null;
        user.RefreshTokenExpiry = null;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("DisconnectSession", "User", user.Id, null, new { user.Email }, ct);
        return Result<bool>.Success(true);
    }
}
