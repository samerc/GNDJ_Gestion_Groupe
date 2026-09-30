using GNDJ.Application.Camps;

namespace GNDJ.Application.Tests;

// The Camp BP rotation grid must be a valid round for EVERY supported number of games: every famille plays once per
// slot, plays every game exactly once, and never meets the same famille twice.
public class CampRotationGridTests
{
    public static IEnumerable<object[]> SupportedGames() =>
        Enumerable.Range(1, CampRotationGrid.MaxGames).Where(g => CampRotationGrid.Problem(g * 2) is null).Select(g => new object[] { g });

    [Theory]
    [MemberData(nameof(SupportedGames))]
    public void Grid_is_a_valid_rotation(int games)
    {
        var grid = CampRotationGrid.Build(games);
        var familles = games * 2;
        Assert.Equal(games, grid.Length);

        var played = new HashSet<(int, int)>();
        var met = new HashSet<(int, int)>();
        foreach (var slot in grid)
        {
            Assert.Equal(games, slot.Length);
            // Every famille plays exactly once in each slot.
            Assert.Equal(Enumerable.Range(1, familles), slot.SelectMany(p => new[] { p.A, p.B }).Order());
            for (var g = 0; g < slot.Length; g++)
            {
                var (a, b) = slot[g];
                Assert.True(played.Add((a, g)), $"famille {a} plays game {g + 1} twice");
                Assert.True(played.Add((b, g)), $"famille {b} plays game {g + 1} twice");
                Assert.True(met.Add((Math.Min(a, b), Math.Max(a, b))), $"familles {a} and {b} meet twice");
            }
        }
        Assert.Equal(familles * games, played.Count);
    }

    [Fact]
    public void Every_size_up_to_the_maximum_is_supported_except_2_and_3_games()
    {
        var unsupported = Enumerable.Range(1, CampRotationGrid.MaxGames).Where(g => CampRotationGrid.Problem(g * 2) is not null);
        Assert.Equal([2, 3], unsupported);
    }

    [Theory]
    [InlineData(51)]   // odd
    [InlineData(4)]    // 2 games — impossible
    [InlineData(6)]    // 3 games — impossible
    [InlineData(102)]  // over the maximum
    [InlineData(0)]
    public void Unsupported_famille_counts_are_explained(int familles)
    {
        Assert.NotNull(CampRotationGrid.Problem(familles));
        if (familles % 2 == 0 && familles > 0) Assert.Throws<ArgumentException>(() => CampRotationGrid.Build(familles / 2));
    }

    [Fact]
    public void The_historical_25_game_grid_is_kept()
    {
        var grid = CampRotationGrid.Build(25);
        Assert.Equal((1, 26), grid[0][0]);
        Assert.Equal((5, 29), grid[1][0]);
        Assert.Equal(15, CampRotationGrid.DefaultFirstDaySlots(25));
        Assert.Equal((new TimeOnly(11, 30), new TimeOnly(11, 43)), CampRotationGrid.DefaultTime(25, 15, 1));
        Assert.Equal((new TimeOnly(11, 0), new TimeOnly(11, 13)), CampRotationGrid.DefaultTime(25, 15, 16));
    }

    [Theory]
    [InlineData(10)]
    [InlineData(30)]
    public void Default_hours_are_increasing_within_each_day(int games)
    {
        var first = CampRotationGrid.DefaultFirstDaySlots(games);
        for (var s = 1; s <= games; s++)
        {
            var (start, end) = CampRotationGrid.DefaultTime(games, first, s);
            Assert.True(end > start);
            if (s > 1 && s != first + 1) Assert.True(start > CampRotationGrid.DefaultTime(games, first, s - 1).Start);
        }
    }
}
