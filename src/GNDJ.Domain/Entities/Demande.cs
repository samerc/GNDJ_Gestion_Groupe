using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// One membership application for one child. Mirrors the Member fields; becomes a real Member on approval.
public class Demande : BaseEntity
{
    public Guid ApplicantAccountId { get; set; }
    public string ScoutYear { get; set; } = string.Empty;

    // Human-facing reference (INS-YYYY-NNNN), assigned on the FIRST submission (drafts stay null so an
    // abandoned draft never burns a number). Sequence is per scout year; unique. Shown to the parent +
    // CG and included in the demande emails ({{demandeNumber}}).
    public string? SerialNumber { get; set; }

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

    // Declared by the parent: has a demande already been presented for this child before, and which year.
    public bool HasPreviousDemande { get; set; }
    public string? PreviousDemandeYear { get; set; }

    public string Status { get; set; } = Enums.DemandeStatus.Draft;
    public DateTime? SubmittedAt { get; set; }
    // Last time the family CHANGED an already-submitted demande (child form or the shared household). The first
    // submission date (SubmittedAt) is kept as is; this shows « modifiée le … » to the family and the CG.
    public DateTime? LastEditedAt { get; set; }

    // CG decision (staged until the batch is sent)
    public Guid? DecidedUnitId { get; set; }   // chosen unit on approval (implies association)
    public string? DecisionNotes { get; set; } // optional decline reason / note
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAt { get; set; }

    // Set when the response batch is sent
    public DateTime? ResponseSentAt { get; set; }
    public Guid? CreatedMemberId { get; set; }

    // « Déjà membre ? » — the app flags a demande whose child looks like a member already in the group (see
    // DemandeMemberMatch). The CG answers: Confirmed = same person → the send updates that member instead of creating a
    // new file (or, if the demande was already sent, the new file is merged into it); Rejected = not the same person →
    // the flag for THAT member is never shown again. Null status = not answered (the flag is computed live).
    public Guid? MemberMatchId { get; set; }
    public string? MemberMatchStatus { get; set; } // DemandeMemberMatchStatus.Confirmed | Rejected

    public ApplicantAccount ApplicantAccount { get; set; } = null!;
    public Unit? DecidedUnit { get; set; }
    public Member? CreatedMember { get; set; }
}
