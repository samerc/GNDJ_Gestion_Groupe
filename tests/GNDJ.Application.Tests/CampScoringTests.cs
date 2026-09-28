using GNDJ.Application.Camps;

namespace GNDJ.Application.Tests;

// The Camp BP scoring rules, checked against the examples of the commission's "Règles pointage des jeux".
public class CampScoringTests
{
    private static CampScoreResult Ok(CampScoreInput i)
    {
        var (r, err) = CampScoring.Compute(i);
        Assert.Null(err);
        return r!;
    }

    [Fact]
    public void Both_on_time_rounds_split_50_each()
    {
        var r = Ok(new("none", "none", "A", "B", 3, "A"));
        Assert.Equal((50, 50), (r.PointsA, r.PointsB));
        Assert.Equal((3, 2), (r.EspritA, r.EspritB));
        Assert.Equal("A", r.Enigme); // 50/50 → the famille that arrived first complete
    }

    [Fact]
    public void Tie_on_points_needs_first_arrived_for_the_enigme()
    {
        var (_, err) = CampScoring.Compute(new("none", "none", "tie", "tie", 2, null));
        Assert.NotNull(err);
        var r = Ok(new("none", "none", "tie", "tie", 2, "B"));
        Assert.Equal((50, 50), (r.PointsA, r.PointsB));
        Assert.Equal("B", r.Enigme);
    }

    [Fact]
    public void Winner_of_both_rounds_takes_100_and_the_enigme()
    {
        var r = Ok(new("none", "none", "A", "A", 1, null));
        Assert.Equal((100, 0), (r.PointsA, r.PointsB));
        Assert.Equal("A", r.Enigme); // esprit points don't count for the énigme
    }

    [Fact]
    public void On_time_vs_retard_A_round1_given_round2_on_50()   // "Famille 1 à temps, famille 2 retard A"
    {
        var plan = CampScoring.Plan("none", "A");
        Assert.Equal(new CampRoundsPlan(50, 0, null, 50), plan);
        // Round 2 lost → 50/50 on points → the énigme goes to the famille that arrived first (the one on time).
        var lost = Ok(new("none", "A", null, "B", 2, null)); // no need to say who came first: A was on time
        Assert.Equal((50, 50), (lost.PointsA, lost.PointsB));
        Assert.Equal("A", lost.Enigme);
        var won = Ok(new("none", "A", null, "A", 2, null));
        Assert.Equal((100, 0), (won.PointsA, won.PointsB));
        Assert.Equal("A", won.Enigme);
    }

    [Fact]
    public void On_time_vs_retard_B_gives_100_and_enigme()          // "Famille 3 à temps, famille 4 retard B"
    {
        var r = Ok(new("none", "B", null, null, 5, null));
        Assert.Equal((100, 0), (r.PointsA, r.PointsB));
        Assert.Equal("A", r.Enigme);
    }

    [Fact]
    public void Both_retard_A_round2_on_100()                          // "Famille 5 et 6 en retard A"
    {
        Assert.Equal(new CampRoundsPlan(0, 0, null, 100), CampScoring.Plan("A", "A"));
        var r = Ok(new("A", "A", null, "B", 2, null));
        Assert.Equal((0, 100), (r.PointsA, r.PointsB));
        Assert.Equal("B", r.Enigme);
        var tie = Ok(new("A", "A", null, "tie", 2, "A"));
        Assert.Equal((50, 50), (tie.PointsA, tie.PointsB));
        Assert.Equal("A", tie.Enigme);
    }

    [Fact]
    public void Retard_A_vs_retard_B_gives_100_to_A()                  // "Famille 7 retard A, famille 8 retard B"
    {
        var r = Ok(new("A", "B", null, null, 4, null));
        Assert.Equal((100, 0), (r.PointsA, r.PointsB));
        Assert.Equal("A", r.Enigme);
    }

    [Fact]
    public void Both_retard_B_nothing_and_no_enigme()
    {
        var r = Ok(new("B", "B", null, null, 3, null));
        Assert.Equal((0, 0), (r.PointsA, r.PointsB));
        Assert.Null(r.Enigme);
    }

    [Fact]
    public void Missing_round_or_esprit_is_refused()
    {
        Assert.NotNull(CampScoring.Compute(new("none", "none", "A", null, 3, null)).Error);
        Assert.NotNull(CampScoring.Compute(new("none", "none", "A", "A", null, null)).Error);
        Assert.NotNull(CampScoring.Compute(new("none", "none", "A", "A", 6, null)).Error);
        Assert.NotNull(CampScoring.Compute(new("late", "none", "A", "A", 3, null)).Error);
    }
}
