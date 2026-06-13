namespace GNDJ.Domain.Enums;

public static class DemandeStatus
{
    public const string Draft = "Draft";         // applicant still editing
    public const string Submitted = "Submitted"; // submitted, awaiting CG decision (editable until window closes)
    public const string Approved = "Approved";   // CG approved (staged) — member created when the batch is sent
    public const string Declined = "Declined";   // CG declined (staged) — notified when the batch is sent
}

public static class ScoutRelationStatus
{
    public const string CurrentInGroup = "CurrentInGroup"; // a current scout in our group (linked member)
    public const string AncienInGroup = "AncienInGroup";   // a former member of our group (alumni)
    public const string OtherGroup = "OtherGroup";         // a scout in another group
}
