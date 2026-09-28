using GNDJ.Application.Camps;

namespace GNDJ.Application.Tests;

// The fixed Camp BP rotation grid must stay a valid round: every famille plays once per slot, plays every game
// exactly once, and never meets the same famille twice.
public class CampRotationGridTests
{
    [Fact]
    public void Grid_has_25_slots_of_25_games_and_25_default_times()
    {
        Assert.Equal(CampRotationGrid.Slots, CampRotationGrid.Pairs.Length);
        Assert.All(CampRotationGrid.Pairs, s => Assert.Equal(CampRotationGrid.Games, s.Length));
        Assert.Equal(CampRotationGrid.Slots, CampRotationGrid.DefaultTimes.Length);
        Assert.All(CampRotationGrid.DefaultTimes, t => Assert.True(t.End > t.Start));
    }

    [Fact]
    public void Every_famille_plays_once_per_slot()
    {
        foreach (var slot in CampRotationGrid.Pairs)
            Assert.Equal(Enumerable.Range(1, 50), slot.SelectMany(p => new[] { p.A, p.B }).Order());
    }

    [Fact]
    public void Every_famille_plays_every_game_once_and_never_meets_twice()
    {
        var played = new HashSet<(int, int)>();
        var met = new HashSet<(int, int)>();
        foreach (var slot in CampRotationGrid.Pairs)
            for (var g = 0; g < slot.Length; g++)
            {
                var (a, b) = slot[g];
                Assert.True(played.Add((a, g)));
                Assert.True(played.Add((b, g)));
                Assert.True(met.Add((Math.Min(a, b), Math.Max(a, b))));
            }
        Assert.Equal(50 * 25, played.Count);
    }
}
