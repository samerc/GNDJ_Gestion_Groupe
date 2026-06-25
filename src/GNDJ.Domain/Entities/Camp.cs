using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A Camp BP edition. The whole group is split into "familles" (mixed teams) balanced by a Note
// computed per member. The Note formula is customizable per camp (coefficients below).
public class Camp : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string ScoutYear { get; set; } = string.Empty;
    public int FamillesCount { get; set; }
    public string Status { get; set; } = CampStatus.Setup; // Setup → Assigned → Closed
    public bool IsArchived { get; set; }

    // Note = ForceCoef*Force + multiplier(branche)*Année + Offset.
    // BranchMultipliers: JSON map unitTypeId(string) → multiplier; defaults to each unit type's NumberOfYears.
    public double NoteForceCoef { get; set; } = 1;
    public double NoteOffset { get; set; } = -4;
    public string? NoteBranchMultipliers { get; set; }

    public ICollection<Famille> Familles { get; set; } = [];
    public ICollection<CampParticipant> Participants { get; set; } = [];
    public ICollection<CampGame> Games { get; set; } = [];
}

public static class CampStatus
{
    public const string Setup = "Setup";
    public const string Assigned = "Assigned";
    public const string Closed = "Closed";
    public static readonly string[] All = [Setup, Assigned, Closed];
}

public static class CampRole
{
    public const string Membre = "Membre";
    public const string Pere = "Pere";
    public const string Mere = "Mere";
    public static readonly string[] All = [Membre, Pere, Mere];
}

// A camp team. Holds drafted members (via CampParticipant.FamilleId) + a manually-assigned Père/Mère.
public class Famille : BaseEntity
{
    public Guid CampId { get; set; }
    public int Number { get; set; }
    public string? Name { get; set; }
    public Guid? PereMemberId { get; set; }
    public Guid? MereMemberId { get; set; }

    public Camp Camp { get; set; } = null!;
    public Member? PereMember { get; set; }
    public Member? MereMember { get; set; }
}

// A member taking part in the camp: their grade (Force + Année → Note) and famille assignment.
public class CampParticipant : BaseEntity
{
    public Guid CampId { get; set; }
    public Guid MemberId { get; set; }
    public Guid? UnitId { get; set; }       // snapshot of their unit at camp time
    public Guid? UnitTypeId { get; set; }   // branche
    public string? Branche { get; set; }    // snapshot name (Meute/Troupe/Jeannette/Compagnie…)
    public string? Gender { get; set; }     // snapshot for balancing
    public bool IsAttending { get; set; } = true;

    public int? Force { get; set; }         // 1–5, from the CU
    public int? Annee { get; set; }         // year in branch (auto-derived, CU-adjustable)
    public double? Note { get; set; }       // computed from the camp formula

    public bool IsLeaderCandidate { get; set; } // CU flag: could be a Père/Mère
    public string Role { get; set; } = CampRole.Membre;
    public Guid? FamilleId { get; set; }    // assigned famille (null until drafted)
    public string? Notes { get; set; }      // "cas particulier"

    public Camp Camp { get; set; } = null!;
    public Member Member { get; set; } = null!;
    public Famille? Famille { get; set; }
}

// A game/étape run by a set of étapistes (CU/ACU). Scoring comes in phase 2.
public class CampGame : BaseEntity
{
    public Guid CampId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    public Camp Camp { get; set; } = null!;
    public ICollection<CampGameEtapiste> Etapistes { get; set; } = [];
}

public class CampGameEtapiste : BaseEntity
{
    public Guid CampGameId { get; set; }
    public Guid MemberId { get; set; }

    public CampGame CampGame { get; set; } = null!;
    public Member Member { get; set; } = null!;
}
