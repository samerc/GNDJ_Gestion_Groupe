namespace GNDJ.Application.Common.Interfaces;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);

    // Fast, deterministic hash for high-entropy tokens (refresh tokens). Unlike passwords,
    // refresh tokens are random 256-bit values, so a salted slow hash (bcrypt) is unnecessary
    // and harmful — it forces an O(N) linear scan on lookup. SHA-256 lets us index and match directly.
    string HashToken(string token);
}
