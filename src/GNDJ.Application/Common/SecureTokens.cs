using System.Security.Cryptography;

namespace GNDJ.Application.Common;

// The secrets the app generates for logins, in one place (they used to be copied in a dozen handlers).
//   • TempPassword  — a password SHOWN to a person (leader « Réinitialiser le mot de passe », CG reset of a parent,
//                     new member created by hand). Readable, but not guessable: the old « Scout2026!123 » format had
//                     only 900 possible values for a predictable identifiant.
//   • HiddenPassword — for a login whose password is never shown (the family sets its own through the emailed
//                     activation link): pure random, nobody can guess or type it.
//   • UrlToken      — the one-time token of a set-password / activation link (URL-safe).
public static class SecureTokens
{
    // No look-alike characters (0/O, 1/I/l) so a password read aloud or copied by hand is typed right.
    private const string Readable = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

    // e.g. « Scout2026!K7mQ4x » — upper + lower + digit + symbol, ~55^6 (2.7e10) combinations.
    public static string TempPassword()
    {
        Span<char> part = stackalloc char[6];
        for (var i = 0; i < part.Length; i++) part[i] = Readable[RandomNumberGenerator.GetInt32(Readable.Length)];
        return $"Scout{DateTime.UtcNow.Year}!{part}";
    }

    public static string HiddenPassword() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    public static string UrlToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "").Replace("/", "").Replace("=", "");
}
