namespace GNDJ.Domain.Enums;

// Passage workflow state: Pending (CU proposed) → Approved (CG or automatic) → Finalized (assignments applied).
// Rejected is legacy: the CG now changes a line instead of rejecting it.
public static class PassageStatus
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string Finalized = "Finalized";
}
