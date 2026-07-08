using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A permanent snapshot of one demande + its outcome, written when a campaign is CLOSED (archive → delete →
// disable). The live demande + all applicant-side data are deleted afterwards; this keeps a lean, denormalized
// record so the CG can review past applications next year. Parent/guardian detail is intentionally NOT copied
// (it lives on the created member); only the account email + contact name are kept to identify the applicant.
public class DemandeArchive : BaseEntity
{
    public string ScoutYear { get; set; } = string.Empty;

    // Child (applicant) fields
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? Nationality { get; set; }
    public string? School { get; set; }
    public string? Classe { get; set; }
    public string? Section { get; set; }
    public string? BloodType { get; set; }
    public string? MedicalNotes { get; set; }
    public string? Allergies { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? ParentNotes { get; set; }
    public bool HasPreviousDemande { get; set; }
    public string? PreviousDemandeYear { get; set; }

    // Applicant identity (for review — not the full household)
    public string? AccountEmail { get; set; }
    public string? ContactName { get; set; }
    public string? AddressCity { get; set; }

    // Outcome
    public string Status { get; set; } = string.Empty;   // Approved / Declined / (Draft/Submitted if never decided)
    public string? DecidedUnitName { get; set; }
    public string? DecisionNotes { get; set; }
    public DateTime? ResponseSentAt { get; set; }
    public Guid? CreatedMemberId { get; set; }
    public string? CreatedMemberCardNumber { get; set; }

    public DateTime ArchivedAt { get; set; }
}
