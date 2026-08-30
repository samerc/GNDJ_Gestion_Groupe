namespace GNDJ.Application.Common;

// A DateTime bound from a query string or JSON body arrives as Kind=Unspecified. Comparing it to — or writing it
// into — a Postgres `timestamptz` column throws "Cannot write DateTime with Kind=Unspecified … only UTC is
// supported". Route every such value through AsUtc() before it reaches EF/Npgsql. Our timestamptz columns are all
// UTC, so an Unspecified value is treated as already-UTC (a Local one is converted).
public static class DateTimeExtensions
{
    public static DateTime AsUtc(this DateTime d) => d.Kind switch
    {
        DateTimeKind.Utc => d,
        DateTimeKind.Local => d.ToUniversalTime(),
        _ => DateTime.SpecifyKind(d, DateTimeKind.Utc),
    };

    public static DateTime? AsUtc(this DateTime? d) => d.HasValue ? d.Value.AsUtc() : null;
}
