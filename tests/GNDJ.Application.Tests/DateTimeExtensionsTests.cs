using GNDJ.Application.Common;

namespace GNDJ.Application.Tests;

// A query-string/JSON DateTime arrives Kind=Unspecified and can't be written to a Postgres timestamptz.
// AsUtc() normalizes it (this is the fix for the audit-log / outbox / error-log date-filter 500s). Our
// timestamptz columns are UTC, so Unspecified is treated as already-UTC and Local is converted.
public class DateTimeExtensionsTests
{
    [Fact]
    public void AsUtc_treats_Unspecified_as_already_utc_without_shifting()
    {
        var d = new DateTime(2026, 8, 30, 12, 0, 0, DateTimeKind.Unspecified);
        var result = d.AsUtc();
        Assert.Equal(DateTimeKind.Utc, result.Kind);
        Assert.Equal(d.Ticks, result.Ticks); // same clock value, just tagged UTC
    }

    [Fact]
    public void AsUtc_leaves_utc_unchanged()
    {
        var d = new DateTime(2026, 8, 30, 12, 0, 0, DateTimeKind.Utc);
        var result = d.AsUtc();
        Assert.Equal(DateTimeKind.Utc, result.Kind);
        Assert.Equal(d.Ticks, result.Ticks);
    }

    [Fact]
    public void AsUtc_converts_local_to_utc()
    {
        var local = new DateTime(2026, 8, 30, 12, 0, 0, DateTimeKind.Local);
        var result = local.AsUtc();
        Assert.Equal(DateTimeKind.Utc, result.Kind);
        Assert.Equal(local.ToUniversalTime(), result);
    }

    [Fact]
    public void AsUtc_nullable_passes_null_through()
    {
        DateTime? none = null;
        Assert.Null(none.AsUtc());
    }

    [Fact]
    public void AsUtc_nullable_normalizes_a_value()
    {
        DateTime? d = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        var result = d.AsUtc();
        Assert.NotNull(result);
        Assert.Equal(DateTimeKind.Utc, result!.Value.Kind);
    }
}
