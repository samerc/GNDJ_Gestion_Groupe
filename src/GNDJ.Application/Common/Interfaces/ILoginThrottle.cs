namespace GNDJ.Application.Common.Interfaces;

// Per-ACCOUNT brute-force protection for the login screens (the rate limiter only works per network address, and
// many imported accounts still share the same temporary password). After a few failed attempts in a row on the
// same email, that email is locked for a short, growing delay — even the right password is refused until then.
// Keyed by the typed email (normalised), so unknown emails lock exactly like real ones: the lockout message never
// reveals whether an account exists. A successful login or a password reset clears the counter.
public interface ILoginThrottle
{
    // Remaining lockout for this email, or null when it may try again. realm = "member" | "applicant".
    TimeSpan? LockedFor(string realm, string email);
    void RecordFailure(string realm, string email);
    void Reset(string realm, string email);
}

public static class LoginThrottleMessages
{
    public static string Locked(TimeSpan wait)
    {
        var minutes = Math.Max(1, (int)Math.Ceiling(wait.TotalMinutes));
        return $"Trop de tentatives de connexion. Réessayez dans {minutes} minute{(minutes > 1 ? "s" : "")}, "
             + "ou utilisez « Mot de passe oublié ».";
    }
}
