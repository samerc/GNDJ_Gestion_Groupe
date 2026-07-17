using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Identity;

// BCrypt password hashing (login credentials) plus a one-way SHA-256 token hash.
// Tuned for a small CPU-bound box: see WorkFactor + the concurrency gate below.
public class PasswordHasher : IPasswordHasher
{
    // Work factor 10 (~65ms/hash) — OWASP-recommended minimum, balances security with
    // throughput on small servers. WF12 (~250ms) saturated a 2-core box under concurrent logins.
    private const int WorkFactor = 10;

    // Cap concurrent BCrypt operations to ~2x core count. BCrypt is CPU-bound; letting
    // hundreds of hashes thrash the cores ballooned login latency to ~50s. Queuing keeps
    // each hash fast and total throughput high.
    private static readonly SemaphoreSlim _gate = new(Math.Max(2, Environment.ProcessorCount * 2));

    public async Task<string> HashAsync(string password)
    {
        // WaitAsync (not Wait) frees the thread while queued; Task.Run runs the CPU-bound hash on a pool
        // thread so the awaiting request thread isn't held either. Under a burst, waiters no longer starve
        // the thread pool — unrelated endpoints stay responsive.
        await _gate.WaitAsync();
        try { return await Task.Run(() => BCrypt.Net.BCrypt.HashPassword(password, workFactor: WorkFactor)); }
        finally { _gate.Release(); }
    }

    public async Task<bool> VerifyAsync(string password, string hash)
    {
        await _gate.WaitAsync();
        try { return await Task.Run(() => BCrypt.Net.BCrypt.Verify(password, hash)); }
        finally { _gate.Release(); }
    }

    // Refresh tokens are stored as a SHA-256 hex digest (fast, deterministic) rather than BCrypt
    // so lookup can hit an index — an O(N) BCrypt scan over every stored token was the bottleneck.
    public string HashToken(string token)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }
}
