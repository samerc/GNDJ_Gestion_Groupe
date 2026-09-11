using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Writes in-app notification rows. Registered as a SINGLETON: it owns no request state and creates its own
// DbContext scope, so it can be called after a handler has already committed (its own scope may not be safe
// to reuse). Best-effort — every path is wrapped so a notification failure can NEVER surface to the caller or
// mask the triggering action. Notifications are a convenience layer: if a row is lost, the underlying state
// change (the doc decision, the demande, …) still happened.
public class NotificationService : INotificationService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(IServiceScopeFactory scopeFactory, ILogger<NotificationService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public Task NotifyMemberAsync(Guid memberId, string type, string title, string? body = null, string? link = null, CancellationToken ct = default)
        => NotifyMembersAsync([memberId], type, title, body, link, ct);

    public async Task NotifyMembersAsync(IEnumerable<Guid> memberIds, string type, string title, string? body = null, string? link = null, CancellationToken ct = default)
    {
        try
        {
            var ids = memberIds.Where(id => id != Guid.Empty).Distinct().ToList();
            if (ids.Count == 0) return;
            using var scope = _scopeFactory.CreateScope();
            var ctx = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            Insert(ctx, ids, type, title, body, link);
            await ctx.SaveChangesAsync(ct);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to write member notifications ({Type})", type); }
    }

    public async Task NotifyGroupManagersAsync(string type, string title, string? body = null, string? link = null, CancellationToken ct = default)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var ctx = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            var ids = await GroupManagerMemberIdsAsync(ctx, ct);
            if (ids.Count == 0) return;
            Insert(ctx, ids, type, title, body, link);
            await ctx.SaveChangesAsync(ct);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to write group-manager notifications ({Type})", type); }
    }

    public async Task NotifyMemberLeadersAsync(Guid memberId, string type, string title, string? body = null, string? link = null, CancellationToken ct = default)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var ctx = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

            // The member's active units → holders of members.edit active in those units (the unit leaders).
            var unitIds = await ctx.MemberAssignments
                .Where(a => a.MemberId == memberId && a.EndDate == null && !a.IsDeleted)
                .Select(a => a.UnitId).Distinct().ToListAsync(ct);
            var leaderIds = unitIds.Count == 0 ? new List<Guid>() : await ctx.MemberAssignments
                .Where(a => a.EndDate == null && !a.IsDeleted && unitIds.Contains(a.UnitId)
                    && a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == Permissions.MembersEdit))
                .Select(a => a.MemberId).Distinct().ToListAsync(ct);

            // + group managers (the CG/ACG also review these), minus the acting member themselves.
            var ids = leaderIds.Concat(await GroupManagerMemberIdsAsync(ctx, ct))
                .Where(id => id != memberId).Distinct().ToList();
            if (ids.Count == 0) return;
            Insert(ctx, ids, type, title, body, link);
            await ctx.SaveChangesAsync(ct);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to write leader notifications ({Type})", type); }
    }

    // Group managers = super-admin logins + members holding an active group-level role (Chef de Groupe / ACG).
    private static async Task<List<Guid>> GroupManagerMemberIdsAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var superAdmins = await ctx.Users.Where(u => u.IsSuperAdmin && u.IsActive).Select(u => u.MemberId).ToListAsync(ct);
        var groupLevel = await ctx.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.IsGroupLevel)
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
        return superAdmins.Concat(groupLevel).Distinct().ToList();
    }

    private static void Insert(IApplicationDbContext ctx, List<Guid> memberIds, string type, string title, string? body, string? link)
    {
        var now = DateTime.UtcNow;
        foreach (var id in memberIds)
            ctx.Notifications.Add(new Notification
            {
                MemberId = id,
                Type = type,
                Title = Trunc(title, 300) ?? string.Empty,
                Body = Trunc(body, 2000),
                LinkUrl = Trunc(link, 500),
                CreatedAt = now,
            });
    }

    private static string? Trunc(string? s, int max) => s is null ? null : s.Length <= max ? s : s[..max];
}
