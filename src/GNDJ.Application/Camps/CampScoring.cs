namespace GNDJ.Application.Camps;

// Camp BP scoring rules of a game (one match = two familles at one étape), taken from the commission's
// "Règles pointage des jeux". Pure logic, shared by the online entry and the typed-in paper sheets:
//
//   • Two rounds ("manches"), 50 points each: the winner takes 50, a tie gives 25 each.
//   • 5 "esprit" points split between the two familles (whole numbers, the sum is always 5).
//   • Lateness: on time = 0–3 min; Retard A = 3–7 min; Retard B = 7–10 min.
//       – on time vs A  → round 1 is given (50) to the famille on time; only round 2 is played (50).
//       – on time vs B  → no round played: 100 to the famille on time.
//       – A vs A        → round 1 gives nobody anything; round 2 is played for 100.
//       – A vs B        → no round played: 100 to the famille in Retard A.
//       – B vs B        → nothing played, 0 – 0.
//   • Énigme: the famille that wins the game (rounds only, not esprit). On a tie, the one that arrived first
//     complete. The losing famille, and a famille in Retard B, never get it.
public static class CampLateness
{
    public const string None = "none";
    public const string A = "A";
    public const string B = "B";
    public static readonly string[] All = [None, A, B];
}

public static class CampMatchSide
{
    public const string A = "A";
    public const string B = "B";
    public const string Tie = "tie";
    public static readonly string[] All = [A, B, Tie];
}

public record CampScoreInput(string? RetardA, string? RetardB, string? Manche1, string? Manche2, int? EspritA, string? FirstArrived);

public record CampScoreResult(int PointsA, int PointsB, int EspritA, int EspritB, string? Enigme);

// Which rounds are actually played, and on how many points each (so the entry form shows only those).
public record CampRoundsPlan(int FixedA, int FixedB, int? Manche1Stake, int? Manche2Stake);

public static class CampScoring
{
    // What lateness leaves to play. FixedA/FixedB = points already given before any round is played.
    public static CampRoundsPlan Plan(string? retardA, string? retardB)
    {
        var a = Norm(retardA);
        var b = Norm(retardB);
        return (a, b) switch
        {
            (CampLateness.None, CampLateness.None) => new(0, 0, 50, 50),
            (CampLateness.None, CampLateness.A) => new(50, 0, null, 50),
            (CampLateness.A, CampLateness.None) => new(0, 50, null, 50),
            (CampLateness.None, CampLateness.B) => new(100, 0, null, null),
            (CampLateness.B, CampLateness.None) => new(0, 100, null, null),
            (CampLateness.A, CampLateness.A) => new(0, 0, null, 100),
            (CampLateness.A, CampLateness.B) => new(100, 0, null, null),
            (CampLateness.B, CampLateness.A) => new(0, 100, null, null),
            _ => new(0, 0, null, null), // B vs B
        };
    }

    // Computes the points, or returns an error message (in French, shown to whoever is entering the score).
    public static (CampScoreResult? Result, string? Error) Compute(CampScoreInput input)
    {
        if (!Valid(input.RetardA, CampLateness.All) || !Valid(input.RetardB, CampLateness.All))
            return (null, "Retard invalide.");
        if (input.EspritA is null) return (null, "Indiquez la répartition des 5 points d'esprit.");
        if (input.EspritA < 0 || input.EspritA > 5) return (null, "Les points d'esprit vont de 0 à 5.");

        var plan = Plan(input.RetardA, input.RetardB);
        int pa = plan.FixedA, pb = plan.FixedB;
        if (plan.Manche1Stake is int s1)
        {
            if (!Valid(input.Manche1, CampMatchSide.All, required: true)) return (null, "Indiquez le résultat de la manche 1.");
            Add(input.Manche1!, s1, ref pa, ref pb);
        }
        if (plan.Manche2Stake is int s2)
        {
            if (!Valid(input.Manche2, CampMatchSide.All, required: true)) return (null, "Indiquez le résultat de la manche 2.");
            Add(input.Manche2!, s2, ref pa, ref pb);
        }

        // Énigme: winner of the game points; a famille in Retard B can never get it.
        var aCan = Norm(input.RetardA) != CampLateness.B;
        var bCan = Norm(input.RetardB) != CampLateness.B;
        string? enigme;
        if (pa > pb) enigme = aCan ? CampMatchSide.A : null;
        else if (pb > pa) enigme = bCan ? CampMatchSide.B : null;
        else if (!aCan && !bCan) enigme = null;          // both in Retard B: nobody
        else
        {
            // Tie: the famille that arrived first complete. When their lateness differs, the less late one arrived
            // first — no need to ask; otherwise it has to be given.
            var first = FirstByLateness(input.RetardA, input.RetardB) ?? input.FirstArrived;
            if (first is not (CampMatchSide.A or CampMatchSide.B))
                return (null, "Égalité : indiquez la famille arrivée en premier au complet (pour l'énigme).");
            enigme = first == CampMatchSide.A ? (aCan ? CampMatchSide.A : null) : (bCan ? CampMatchSide.B : null);
        }

        return (new CampScoreResult(pa, pb, input.EspritA.Value, 5 - input.EspritA.Value, enigme), null);
    }

    private static void Add(string side, int stake, ref int pa, ref int pb)
    {
        if (side == CampMatchSide.A) pa += stake;
        else if (side == CampMatchSide.B) pb += stake;
        else { pa += stake / 2; pb += stake / 2; }
    }

    // A | B when one famille was less late than the other (so it arrived first), null when equally late.
    public static string? FirstByLateness(string? retardA, string? retardB)
    {
        static int Rank(string r) => r switch { CampLateness.A => 1, CampLateness.B => 2, _ => 0 };
        int a = Rank(Norm(retardA)), b = Rank(Norm(retardB));
        return a == b ? null : (a < b ? CampMatchSide.A : CampMatchSide.B);
    }

    private static string Norm(string? retard) => string.IsNullOrEmpty(retard) ? CampLateness.None : retard;

    private static bool Valid(string? v, string[] allowed, bool required = false) =>
        string.IsNullOrEmpty(v) ? !required : allowed.Contains(v);
}
