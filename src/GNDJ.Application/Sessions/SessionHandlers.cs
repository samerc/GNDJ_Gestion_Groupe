using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Sessions;

// "Sessions actives" — a super-admin view of who currently holds a live session, plus the ability to
// force-disconnect one. Members/chefs have ONE ROW PER SIGNED-IN DEVICE (UserSession, each with its own
// rotating refresh token); parent-portal accounts still hold a single refresh token (one row per account).
// "En ligne" is derived from the last activity (stamped on login + every refresh, a ~15-min heartbeat).
// Disconnect = delete the device session / clear the parent's token: it can no longer refresh and its access
// token dies within ≤15 minutes (revocation is "≤15 min", never instant — inherent to stateless JWT).

// One active session row (member/chef OR parent-portal account).
public record ActiveSessionDto(
    string Kind,            // "member" | "applicant"
    Guid Id,                // UserSession.Id (member device) or ApplicantAccount.Id: the disconnect target
    string Name,
    string? Detail,         // login email / contact email — identifies the account
    DateTime? LoginAt,      // original sign-in (LastLoginAt)
    DateTime? LastActivityAt,
    DateTime? ExpiresAt,    // refresh-token expiry — the session's hard ceiling
    bool IsOnline,          // last activity within the online window
    string? UserAgent = null, // member device: browser/OS, turned into a readable device name by the page
    string? IpAddress = null,
    bool IsCurrent = false);  // the viewer's own current device

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

        // Members / chefs: one row per live device session, with the member's name (Member is soft-delete filtered).
        var memberRows = await (
            from s in context.UserSessions
            where s.ExpiresAt > now && s.User.IsActive
            join m in context.Members on s.User.MemberId equals m.Id
            select new
            {
                s.Id, m.FirstName, m.LastName, s.User.Email,
                s.CreatedAt, s.LastActivityAt, s.ExpiresAt, s.UserAgent, s.IpAddress
            }).ToListAsync(ct);

        var members = memberRows
            .Select(r => new ActiveSessionDto(
                "member", r.Id,
                $"{r.FirstName} {r.LastName}".Trim(),
                r.Email, r.CreatedAt, r.LastActivityAt, r.ExpiresAt,
                r.LastActivityAt >= cutoff, r.UserAgent, r.IpAddress, r.Id == currentUser.SessionId))
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

// Force-disconnect one member DEVICE (delete its session) or one parent-portal account (clear its token).
// Access dies within ≤15 min.
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

        var session = await context.UserSessions.Include(s => s.User).FirstOrDefaultAsync(s => s.Id == request.Id, ct);
        if (session is null) return Result<bool>.Failure("Session introuvable.");
        context.UserSessions.Remove(session);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("DisconnectSession", "User", session.UserId, null, new { session.User.Email, Device = session.UserAgent }, ct);
        return Result<bool>.Success(true);
    }
}

// ── "Mes appareils": the signed-in user's own devices ──

public record MyDeviceDto(Guid Id, string? UserAgent, string? IpAddress, DateTime CreatedAt, DateTime LastActivityAt,
    DateTime ExpiresAt, bool IsCurrent);

public record GetMyDevicesQuery() : IRequest<Result<List<MyDeviceDto>>>;

public class GetMyDevicesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMyDevicesQuery, Result<List<MyDeviceDto>>>
{
    public async ValueTask<Result<List<MyDeviceDto>>> Handle(GetMyDevicesQuery request, CancellationToken ct)
    {
        if (currentUser.UserId is not Guid userId) return Result<List<MyDeviceDto>>.Failure("Non authentifié.");
        var now = DateTime.UtcNow;
        var rows = await context.UserSessions
            .Where(s => s.UserId == userId && s.ExpiresAt > now)
            .Select(s => new MyDeviceDto(s.Id, s.UserAgent, s.IpAddress, s.CreatedAt, s.LastActivityAt, s.ExpiresAt, false))
            .ToListAsync(ct);
        // The calling device first (flagged), then the most recently used.
        var list = rows.Select(r => r with { IsCurrent = r.Id == currentUser.SessionId })
            .OrderByDescending(r => r.IsCurrent).ThenByDescending(r => r.LastActivityAt).ToList();
        return Result<List<MyDeviceDto>>.Success(list);
    }
}

// Signs one of MY devices out (only a session of the caller's own account).
public record EndMyDeviceCommand(Guid Id) : IRequest<Result<bool>>;

public class EndMyDeviceCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<EndMyDeviceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(EndMyDeviceCommand request, CancellationToken ct)
    {
        if (currentUser.UserId is not Guid userId) return Result<bool>.Failure("Non authentifié.");
        var session = await context.UserSessions.FirstOrDefaultAsync(s => s.Id == request.Id && s.UserId == userId, ct);
        if (session is null) return Result<bool>.Failure("Appareil introuvable.");
        context.UserSessions.Remove(session);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("SignOutDevice", "User", userId, null, new { Device = session.UserAgent }, ct);
        return Result<bool>.Success(true);
    }
}
