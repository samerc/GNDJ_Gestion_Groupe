using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Common;

// Device sessions (one UserSession row per signed-in device). Every path that signs someone in, rotates a
// token, or signs devices out goes through here, so the rules live in one place:
// - each device has its own rotating refresh token → signing in on the phone no longer signs the PC out;
// - a password change/reset, a disabled login, or a deleted member ends EVERY device;
// - a rotated token stays valid for a short grace window, so a refresh whose response was lost (flaky mobile
//   network) doesn't sign the device out.
public static class UserSessions
{
    // How long the previous token of a session is still accepted after a rotation.
    public const int GraceSeconds = 120;
    // Upper bound of live devices per account; the least recently used ones are dropped beyond it.
    private const int MaxSessionsPerUser = 20;

    // Signs a new device in: adds its session (saved by the caller's SaveChanges) and returns the session id
    // (for the access token's "sid" claim) + the raw refresh token (only ever sent to the device).
    public static async Task<(Guid SessionId, string RefreshToken)> StartAsync(
        IApplicationDbContext context, ITokenService tokenService, IPasswordHasher hasher,
        ICurrentUserService device, Guid userId, bool rememberMe, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        // Housekeeping for this account: drop expired devices, and the oldest ones beyond the cap.
        await context.UserSessions.Where(s => s.UserId == userId && s.ExpiresAt <= now).ExecuteDeleteAsync(ct);
        var overflow = await context.UserSessions.Where(s => s.UserId == userId)
            .OrderByDescending(s => s.LastActivityAt).Skip(MaxSessionsPerUser - 1).Select(s => s.Id).ToListAsync(ct);
        if (overflow.Count > 0)
            await context.UserSessions.Where(s => overflow.Contains(s.Id)).ExecuteDeleteAsync(ct);

        var raw = tokenService.GenerateRefreshToken();
        var session = new UserSession
        {
            UserId = userId,
            TokenHash = hasher.HashToken(raw),
            ExpiresAt = tokenService.GetRefreshTokenExpiry(rememberMe),
            RememberMe = rememberMe,
            CreatedAt = now,
            LastActivityAt = now,
            UserAgent = Trunc(device.UserAgent, 500),
            IpAddress = Trunc(device.IpAddress, 64),
        };
        context.UserSessions.Add(session);
        return (session.Id, raw);
    }

    // Finds the live session a refresh token belongs to: its current token, or its previous one during the
    // grace window. Null = unknown/expired token (the device must sign in again).
    public static Task<UserSession?> FindByTokenAsync(
        IApplicationDbContext context, IPasswordHasher hasher, string refreshToken, CancellationToken ct)
    {
        var hash = hasher.HashToken(refreshToken);
        var now = DateTime.UtcNow;
        var graceStart = now.AddSeconds(-GraceSeconds);
        return context.UserSessions
            .Include(s => s.User).ThenInclude(u => u.Member)
            .FirstOrDefaultAsync(s => s.ExpiresAt > now
                && (s.TokenHash == hash || (s.PreviousTokenHash == hash && s.RotatedAt > graceStart)), ct);
    }

    // Issues the device a new refresh token (the old one stays accepted for the grace window). rememberMe
    // null = keep the session's current choice. Saved by the caller's SaveChanges.
    public static string Rotate(UserSession session, ITokenService tokenService, IPasswordHasher hasher,
        ICurrentUserService device, bool? rememberMe = null)
    {
        var now = DateTime.UtcNow;
        var raw = tokenService.GenerateRefreshToken();
        session.PreviousTokenHash = session.TokenHash;
        session.RotatedAt = now;
        session.TokenHash = hasher.HashToken(raw);
        if (rememberMe is not null) session.RememberMe = rememberMe.Value;
        session.ExpiresAt = tokenService.GetRefreshTokenExpiry(session.RememberMe); // sliding window
        session.LastActivityAt = now;
        var ua = Trunc(device.UserAgent, 500);
        if (!string.IsNullOrEmpty(ua)) session.UserAgent = ua;
        var ip = Trunc(device.IpAddress, 64);
        if (!string.IsNullOrEmpty(ip)) session.IpAddress = ip;
        return raw;
    }

    // "Keep only this device": signs out every OTHER device and gives the calling device a fresh token
    // (keeping its "Rester connecté" choice). If the calling token has no session (an access token minted
    // before device sessions existed), every device is signed out and a new session is started here.
    public static async Task<(Guid SessionId, string RefreshToken)> KeepThisDeviceOnlyAsync(
        IApplicationDbContext context, ITokenService tokenService, IPasswordHasher hasher,
        ICurrentUserService device, Guid userId, CancellationToken ct)
    {
        var current = device.SessionId is Guid sid
            ? await context.UserSessions.FirstOrDefaultAsync(s => s.Id == sid && s.UserId == userId, ct)
            : null;
        await EndAllAsync(context, userId, ct, current?.Id);
        if (current is null)
            return await StartAsync(context, tokenService, hasher, device, userId, rememberMe: true, ct);
        var raw = Rotate(current, tokenService, hasher, device);
        current.PreviousTokenHash = null; // no grace here: the point is to invalidate what came before
        current.RotatedAt = null;
        return (current.Id, raw);
    }

    // Signs out every device of an account (optionally keeping one). Runs immediately (set-based delete).
    public static Task<int> EndAllAsync(IApplicationDbContext context, Guid userId, CancellationToken ct, Guid? exceptSessionId = null)
        => context.UserSessions
            .Where(s => s.UserId == userId && (exceptSessionId == null || s.Id != exceptSessionId))
            .ExecuteDeleteAsync(ct);

    private static string? Trunc(string? s, int max)
        => string.IsNullOrWhiteSpace(s) ? null : s.Length <= max ? s : s[..max];
}
