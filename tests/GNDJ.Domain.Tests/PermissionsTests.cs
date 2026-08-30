using GNDJ.Domain.Enums;

namespace GNDJ.Domain.Tests;

// Permissions.All is the whitelist a grant is validated against (UpdateSecurityProfilePermissions) and the
// source of the super-admin/CG derived sets. A duplicate or malformed entry would silently corrupt those
// checks, so guard the invariants.
public class PermissionsTests
{
    [Fact]
    public void All_has_no_duplicates()
    {
        Assert.Equal(Permissions.All.Length, Permissions.All.Distinct().Count());
    }

    [Fact]
    public void All_entries_are_lowercase_dotted_keys()
    {
        // Every permission is "area.action" (lowercase, snake/dotted) — matches the [HasPermission("...")] strings.
        foreach (var p in Permissions.All)
        {
            Assert.False(string.IsNullOrWhiteSpace(p));
            Assert.Contains('.', p);
            Assert.Equal(p, p.ToLowerInvariant());
            Assert.DoesNotContain(' ', p);
        }
    }

    [Theory]
    [InlineData(Permissions.MembersEdit)]
    [InlineData(Permissions.MaitriseManage)]
    [InlineData(Permissions.DemandeManage)]
    [InlineData(Permissions.CotisationsDelete)]
    [InlineData(Permissions.AdminHardDelete)]
    public void All_contains_known_permissions(string permission)
    {
        Assert.Contains(permission, Permissions.All);
    }
}
