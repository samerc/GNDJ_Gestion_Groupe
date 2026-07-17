namespace GNDJ.Application.Common.Interfaces;

public interface IPasswordHasher
{
    // Async so a queued hash/verify (bcrypt is CPU-bound and concurrency-gated) does NOT block a thread-pool
    // thread while it waits its turn — under a login storm the old blocking gate starved the pool and stalled
    // unrelated requests. The gate wait + bcrypt run off the request thread.
    Task<string> HashAsync(string password);
    Task<bool> VerifyAsync(string password, string hash);

    // Fast, deterministic hash for high-entropy tokens (refresh tokens). Unlike passwords,
    // refresh tokens are random 256-bit values, so a salted slow hash (bcrypt) is unnecessary
    // and harmful — it forces an O(N) linear scan on lookup. SHA-256 lets us index and match directly.
    string HashToken(string token);
}
