namespace GNDJ.Domain.Entities;

// One planned maîtrise change for the coming scout year, prepared by the CG and applied together with the youth
// passage ("Publier le passage", same passage date). Two kinds:
//   End   = close an existing leadership function (AssignmentId) on the passage date;
//   Start = open a new leadership function (MemberId in UnitId as FunctionalRoleId) on the passage date.
// A change of unit/function is an End + a Start. When a YOUTH is planned to join the maîtrise, their youth passage
// line is overwritten to "leaves the unit" (the CU's line, if any, is kept in YouthPassageSnapshot so cancelling the
// plan line restores it; YouthPassageCreated = the line was created by the plan and is deleted on cancel).
// Plain table (no soft-delete): cancelling a planned change removes the row. AppliedAt is set when published.
public class MaitrisePlanLine
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public string ScoutYear { get; set; } = string.Empty; // year being entered (= passage.scout_year)
    public string Kind { get; set; } = MaitrisePlanKinds.Start;
    public Guid MemberId { get; set; }
    public Guid UnitId { get; set; }
    public Guid FunctionalRoleId { get; set; }
    public Guid? AssignmentId { get; set; } // End: the leadership assignment to close
    public string? Notes { get; set; }

    public Guid? YouthPassageId { get; set; }
    public bool YouthPassageCreated { get; set; }
    public string? YouthPassageSnapshot { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? CreatedByUserId { get; set; }
    public DateTime? AppliedAt { get; set; }

    public Member Member { get; set; } = null!;
    public Unit Unit { get; set; } = null!;
    public FunctionalRole FunctionalRole { get; set; } = null!;
}

public static class MaitrisePlanKinds
{
    public const string Start = "Start";
    public const string End = "End";
}
