using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// One membership application for one child. Mirrors the Member fields; becomes a real Member on approval.
public class Demande : BaseEntity
{
    public Guid ApplicantAccountId { get; set; }
    public string ScoutYear { get; set; } = string.Empty;

    // Applicant (member) fields
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

    // Applicant's own contact (optional — many children have none)
    public string? PhoneCountryCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }

    public string? ParentNotes { get; set; } // free text incl. unit requests (char-capped)

    public string Status { get; set; } = Enums.DemandeStatus.Draft;
    public DateTime? SubmittedAt { get; set; }

    // CG decision (staged until the batch is sent)
    public Guid? DecidedUnitId { get; set; }   // chosen unit on approval (implies association)
    public string? DecisionNotes { get; set; } // optional decline reason / note
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAt { get; set; }

    // Set when the response batch is sent
    public DateTime? ResponseSentAt { get; set; }
    public Guid? CreatedMemberId { get; set; }

    public ApplicantAccount ApplicantAccount { get; set; } = null!;
    public Unit? DecidedUnit { get; set; }
    public Member? CreatedMember { get; set; }
}
