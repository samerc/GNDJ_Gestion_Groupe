namespace GNDJ.Domain.Enums;

// Lifecycle of a membership application (Demande). Decisions are staged and only revealed when the batch is sent.
public static class DemandeStatus
{
    public const string Draft = "Draft";         // applicant still editing
    public const string Submitted = "Submitted"; // submitted, awaiting CG decision (editable until window closes)
    public const string Approved = "Approved";   // CG approved (staged) — member created when the batch is sent
    public const string Declined = "Declined";   // CG declined (staged) — notified when the batch is sent
    public const string Expired = "Expired";     // DISPLAY-ONLY (never persisted): a draft left unsubmitted past the deadline
}

// Standing of an applicant's declared scout relation (ApplicantScoutRelation) — helps the CG match families.
public static class ScoutRelationStatus
{
    public const string CurrentInGroup = "CurrentInGroup"; // a current scout in our group (linked member)
    public const string AncienInGroup = "AncienInGroup";   // a former member of our group (alumni)
    public const string OtherGroup = "OtherGroup";         // a scout in another group
}
