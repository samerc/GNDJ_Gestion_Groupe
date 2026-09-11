using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Resolves entity GUIDs to human-readable names for the audit log, so an audit detail reads
// "Membre : Jean Dupont · Unité proposée : Meute 2ᵉ" instead of raw ids. Audit is low-frequency
// (admin actions), so the few extra lookups per entry are fine. All resolvers are null-safe:
// a null id → null (omit the line); an unknown id → the id string (never crashes / hides the value).
// The frontend maps the PascalCase keys to French labels (audit-logs FIELD_LABELS).
public static class AuditNames
{
    public static async Task<string?> MemberAsync(IApplicationDbContext ctx, Guid? id, CancellationToken ct)
        => id is null ? null : (await ctx.Members.IgnoreQueryFilters().Where(m => m.Id == id.Value)
            .Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct)) ?? id.ToString();

    public static async Task<string?> UnitAsync(IApplicationDbContext ctx, Guid? id, CancellationToken ct)
        => id is null ? null : (await ctx.Units.IgnoreQueryFilters().Where(u => u.Id == id.Value)
            .Select(u => u.Name).FirstOrDefaultAsync(ct)) ?? id.ToString();

    public static async Task<string?> RoleAsync(IApplicationDbContext ctx, Guid? id, CancellationToken ct)
        => id is null ? null : (await ctx.FunctionalRoles.IgnoreQueryFilters().Where(r => r.Id == id.Value)
            .Select(r => r.Name).FirstOrDefaultAsync(ct)) ?? id.ToString();

    public static async Task<string?> TeamAsync(IApplicationDbContext ctx, Guid? id, CancellationToken ct)
        => id is null ? null : (await ctx.Teams.IgnoreQueryFilters().Where(t => t.Id == id.Value)
            .Select(t => t.Name).FirstOrDefaultAsync(ct)) ?? id.ToString();

    public static async Task<string?> GuardianAsync(IApplicationDbContext ctx, Guid? id, CancellationToken ct)
        => id is null ? null : (await ctx.Guardians.IgnoreQueryFilters().Where(g => g.Id == id.Value)
            .Select(g => g.FirstName + " " + g.LastName).FirstOrDefaultAsync(ct)) ?? id.ToString();

    // Resolves a list of member ids to a comma-joined "First Last" string (for merges / sibling groups).
    public static async Task<string?> MembersAsync(IApplicationDbContext ctx, IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        if (ids is null || ids.Count == 0) return null;
        var names = await ctx.Members.IgnoreQueryFilters().Where(m => ids.Contains(m.Id))
            .Select(m => m.FirstName + " " + m.LastName).ToListAsync(ct);
        return names.Count > 0 ? string.Join(", ", names) : string.Join(", ", ids);
    }
}
