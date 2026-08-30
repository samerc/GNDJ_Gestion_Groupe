using GNDJ.Application.Rentree;

namespace GNDJ.Application.Tests;

// A rentrée task's ActionKey must be a known catalog value (validated on save). This catalog is mirrored on the
// frontend (client/src/lib/rentree-actions.ts) — the test guards the backend half.
public class RentreeActionsTests
{
    [Theory]
    [InlineData(RentreeActions.OpenDemandes)]
    [InlineData(RentreeActions.OpenPassage)]
    [InlineData("goto-documents-suivi")]
    [InlineData("goto-settings")]
    [InlineData(null)]  // no action attached
    [InlineData("")]    // no action attached
    public void IsValid_accepts_known_keys_and_empty(string? key)
    {
        Assert.True(RentreeActions.IsValid(key));
    }

    [Theory]
    [InlineData("goto-nowhere")]
    [InlineData("do-something-unknown")]
    [InlineData("open-demandes ")] // trailing space is not the constant
    public void IsValid_rejects_unknown_keys(string key)
    {
        Assert.False(RentreeActions.IsValid(key));
    }

    [Fact]
    public void Do_and_goto_action_sets_do_not_overlap()
    {
        Assert.Empty(RentreeActions.DoActions.Intersect(RentreeActions.GotoActions));
    }
}
