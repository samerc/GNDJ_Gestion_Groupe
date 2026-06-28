namespace GNDJ.Domain.Enums;

// Passage workflow state: Pending (CU proposed) → Approved (CG) → Finalized (assignments applied); or Rejected.
public static class PassageStatus
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string Finalized = "Finalized";
}
