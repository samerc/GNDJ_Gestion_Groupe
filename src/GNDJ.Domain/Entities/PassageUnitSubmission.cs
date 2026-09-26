namespace GNDJ.Domain.Entities;

// A unit's passage marked as finished by its CU ("Terminer le passage de l'unité") for one scout year. While
// it exists, the CU can no longer change the unit's lines — the CG has built their per-unit plan on them;
// only the CG changes lines (or reopens the unit, which deletes this row). Posting the passage requires every
// unit with active members to be finished. Plain table (no soft-delete): reopening simply removes the row.
public class PassageUnitSubmission
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public string ScoutYear { get; set; } = string.Empty;
    public Guid UnitId { get; set; }
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public Guid? SubmittedByUserId { get; set; }

    public Unit Unit { get; set; } = null!;
}
