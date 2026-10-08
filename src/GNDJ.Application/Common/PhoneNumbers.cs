namespace GNDJ.Application.Common;

// Format-insensitive phone matching, shared by the demande conversion, « Déjà membre ? », Fratries, guardian search
// and the leaver-contact dialog (each used to carry its own copy).
public static class PhoneNumbers
{
    // Digits only: "+961 76 123 456" / "76-123 456" → "96176123456" / "76123456".
    public static string Digits(string? s) => new((s ?? "").Where(char.IsDigit).ToArray());

    // Same number written differently: "03 188 090", "3188090", "+961 3 188 090", "009613188090" → compare the last 7
    // digits (Lebanese numbers are 7–8 digits after the country code / trunk 0). Takes digit strings (see Digits);
    // anything shorter than 6 digits never matches.
    public static bool SameDigits(string a, string b) =>
        a.Length >= 6 && b.Length >= 6 && (a.Length >= 7 && b.Length >= 7 ? a[^7..] == b[^7..] : a == b);
}
