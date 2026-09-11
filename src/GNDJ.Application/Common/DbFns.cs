namespace GNDJ.Application.Common;

// Database-mapped functions (translated to SQL by EF; never executed in-process).
public static class DbFns
{
    // Postgres unaccent(): strips diacritics so searches treat "é" as "e". Mapped in GndjDbContext.
    public static string Unaccent(string input) => throw new NotSupportedException("DB-only function");

    // Renders a jsonb column as text (Postgres jsonb_pretty) so a jsonb snapshot can be substring-searched
    // (lower/unaccent/Contains) — plain .ToLower() on a jsonb column fails ("lower(jsonb) does not exist").
    // Mapped in GndjDbContext.
    public static string JsonbToText(string input) => throw new NotSupportedException("DB-only function");
}
