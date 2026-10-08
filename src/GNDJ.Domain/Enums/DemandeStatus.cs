namespace GNDJ.Domain.Enums;

// Lifecycle of a membership application (Demande). Decisions are staged and only revealed when the batch is sent.
public static class DemandeStatus
{
    public const string Draft = "Draft";         // applicant still editing
    public const string Submitted = "Submitted"; // submitted, awaiting CG decision (editable until window closes)
    public const string Approved = "Approved";   // CG approved (staged) — member created when the batch is sent
    public const string Declined = "Declined";   // CG declined (staged) — notified when the batch is sent
    // The child is ALREADY an active member (« Déjà membre ? » confirmed by the CG): the send only updates the existing
    // fiche with the demande's data — no new file, no post change, no email.
    public const string AlreadyMember = "AlreadyMember";
    public const string Expired = "Expired";     // DISPLAY-ONLY (never persisted): a draft left unsubmitted past the deadline
}

// Standing of an applicant's declared scout relation (ApplicantScoutRelation) — helps the CG match families.
public static class ScoutRelationStatus
{
    public const string CurrentInGroup = "CurrentInGroup"; // a current scout in our group (linked member)
    public const string AncienInGroup = "AncienInGroup";   // a former member of our group (alumni)
    public const string OtherGroup = "OtherGroup";         // a scout in another group
}

// The CG's answer to a « Déjà membre ? » flag on a demande (Demande.MemberMatchStatus).
public static class DemandeMemberMatchStatus
{
    public const string Confirmed = "Confirmed"; // same person: the send reuses / merges into that member
    public const string Rejected = "Rejected";   // not the same person: a new member file is created
}
