using System.Collections.Concurrent;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GNDJ.Infrastructure.Services;

public interface ISettingsCacheService
{
    Task<string?> GetAsync(string key);
    Task<Dictionary<string, string>> GetAllAsync();
    void Invalidate();
}

public class SettingsCacheService : ISettingsCacheService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private ConcurrentDictionary<string, string>? _cache;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private DateTime _lastLoad = DateTime.MinValue;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    public SettingsCacheService(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    public async Task<string?> GetAsync(string key)
    {
        var cache = await EnsureCacheAsync();
        return cache.TryGetValue(key, out var value) ? value : null;
    }

    public async Task<Dictionary<string, string>> GetAllAsync()
    {
        var cache = await EnsureCacheAsync();
        return new Dictionary<string, string>(cache);
    }

    public void Invalidate()
    {
        _cache = null;
        _lastLoad = DateTime.MinValue;
    }

    private async Task<ConcurrentDictionary<string, string>> EnsureCacheAsync()
    {
        if (_cache != null && DateTime.UtcNow - _lastLoad < CacheDuration)
            return _cache;

        await _lock.WaitAsync();
        try
        {
            if (_cache != null && DateTime.UtcNow - _lastLoad < CacheDuration)
                return _cache;

            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
            var settings = await context.Settings
                .AsNoTracking()
                .ToDictionaryAsync(s => s.Key, s => s.Value);

            _cache = new ConcurrentDictionary<string, string>(settings);
            _lastLoad = DateTime.UtcNow;
            return _cache;
        }
        finally
        {
            _lock.Release();
        }
    }
}
