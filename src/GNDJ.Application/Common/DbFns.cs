namespace GNDJ.Application.Common;

// Database-mapped functions (translated to SQL by EF; never executed in-process).
public static class DbFns
{
    // Postgres unaccent(): strips diacritics so searches treat "é" as "e". Mapped in GndjDbContext.
    public static string Unaccent(string input) => throw new NotSupportedException("DB-only function");
}
