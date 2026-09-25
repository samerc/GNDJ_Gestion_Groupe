using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Caching.Memory;

namespace GNDJ.Infrastructure.Services;

// In-memory per-account login lockout (see ILoginThrottle). 5 failures in a row → locked 1 minute, then each further
// failure doubles the delay (2, 4, 8… minutes), capped at 30. The counter forgets an email after an hour without
// failures. In memory on purpose: a single app server, and a restart only gives an attacker a few extra tries.
public class LoginThrottle(IMemoryCache cache) : ILoginThrottle
{
    private const int FreeAttempts = 5;
    private static readonly TimeSpan MaxLock = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan Forget = TimeSpan.FromHours(1);

    private sealed class Entry
    {
        public int Failures;
        public DateTime LockedUntil;
    }

    private static string Key(string realm, string email) => $"login-throttle:{realm}:{(email ?? "").Trim().ToLowerInvariant()}";

    public TimeSpan? LockedFor(string realm, string email)
    {
        if (!cache.TryGetValue(Key(realm, email), out Entry? e) || e is null) return null;
        lock (e)
        {
            var left = e.LockedUntil - DateTime.UtcNow;
            return left > TimeSpan.Zero ? left : null;
        }
    }

    public void RecordFailure(string realm, string email)
    {
        var key = Key(realm, email);
        var e = cache.GetOrCreate(key, c => { c.SlidingExpiration = Forget; return new Entry(); })!;
        lock (e)
        {
            e.Failures++;
            if (e.Failures >= FreeAttempts)
            {
                var minutes = Math.Pow(2, e.Failures - FreeAttempts); // 1, 2, 4, 8…
                var wait = TimeSpan.FromMinutes(Math.Min(minutes, MaxLock.TotalMinutes));
                e.LockedUntil = DateTime.UtcNow + wait;
            }
        }
    }

    public void Reset(string realm, string email) => cache.Remove(Key(realm, email));
}
