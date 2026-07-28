using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace GNDJ.Infrastructure.Services;

// Reads the maintenance.* flags + message, cached for a few seconds in the shared IMemoryCache so the
// maintenance middleware can consult it on every request without a DB round-trip. A toggle takes effect
// within the cache window (~15s). Scoped (owns a DbContext); the cache is the singleton.
public class MaintenanceProvider : IMaintenanceProvider
{
    private const string CacheKey = "maintenance_state";
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);

    private readonly IApplicationDbContext _context;
    private readonly IMemoryCache _cache;

    public MaintenanceProvider(IApplicationDbContext context, IMemoryCache cache)
    {
        _context = context;
        _cache = cache;
    }

    public async Task<MaintenanceState> GetAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(CacheKey, out MaintenanceState? cached) && cached is not null)
            return cached;

        var keys = new[] { "maintenance.site", "maintenance.public", "maintenance.demande", "maintenance.membres", "maintenance.message" };
        var map = await _context.Settings.Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        bool Flag(string k) => map.TryGetValue(k, out var v) && string.Equals(v, "true", StringComparison.OrdinalIgnoreCase);
        var message = map.TryGetValue("maintenance.message", out var m) && !string.IsNullOrWhiteSpace(m)
            ? m
            : "Cette partie du site est momentanément en maintenance. Merci de réessayer plus tard.";

        var state = new MaintenanceState(Flag("maintenance.site"), Flag("maintenance.public"), Flag("maintenance.demande"), Flag("maintenance.membres"), message);
        _cache.Set(CacheKey, state, Ttl);
        return state;
    }
}
