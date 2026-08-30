using GNDJ.Domain.Entities;

namespace GNDJ.Domain.Tests;

// A member group is either "top-level" (one combined list: the whole group, or a branch NOT split per unit)
// or "per-unit" (one list per unit: a single Unit, or a branch flagged PerUnit like Haute Patrouille). The two
// modes must be mutually exclusive and cover every scope — the réunion routing depends on it.
public class MemberGroupModesTests
{
    [Theory]
    // scopeType,           perUnit, expectedTopLevel, expectedPerUnit
    [InlineData(MemberGroupScopes.Group,    false, true,  false)] // whole group
    [InlineData(MemberGroupScopes.Group,    true,  true,  false)] // perUnit is meaningless for a whole-group scope
    [InlineData(MemberGroupScopes.UnitType, false, true,  false)] // branch, combined
    [InlineData(MemberGroupScopes.UnitType, true,  false, true)]  // branch, split per unit
    [InlineData(MemberGroupScopes.Unit,     false, false, true)]  // single unit is always per-unit
    [InlineData(MemberGroupScopes.Unit,     true,  false, true)]
    public void Modes_match_the_scope(string scopeType, bool perUnit, bool expectedTopLevel, bool expectedPerUnit)
    {
        Assert.Equal(expectedTopLevel, MemberGroupModes.IsTopLevel(scopeType, perUnit));
        Assert.Equal(expectedPerUnit, MemberGroupModes.IsPerUnit(scopeType, perUnit));
    }

    [Theory]
    [InlineData(MemberGroupScopes.Group)]
    [InlineData(MemberGroupScopes.UnitType)]
    [InlineData(MemberGroupScopes.Unit)]
    public void TopLevel_and_PerUnit_are_mutually_exclusive(string scopeType)
    {
        foreach (var perUnit in new[] { true, false })
            Assert.NotEqual(MemberGroupModes.IsTopLevel(scopeType, perUnit), MemberGroupModes.IsPerUnit(scopeType, perUnit));
    }
}
