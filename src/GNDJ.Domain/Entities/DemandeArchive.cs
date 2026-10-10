using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A permanent snapshot of one demande + its outcome, written when a campaign is CLOSED (archive → delete →
// disable). The live demande + all applicant-side data are deleted afterwards; this keeps a lean, denormalized
// record so the CG can review past applications next year. Parents are kept as one readable line + their contact
// keys (since 2026-10: to recognise the family next year — « Demande précédente » — and search by parent).
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
    // « Père : Jean KHOURY (70 123 456, jean@x.com) · Mère : … » — readable, shown in the archive.
    public string? ParentsSummary { get; set; }
    // Parents' phones (last 7 digits) and emails as space-separated keys « p:1234567 e:jean@x.com », for matching.
    public string? ParentContactKeys { get; set; }

    // Outcome
    public string Status { get; set; } = string.Empty;   // Approved / Declined / (Draft/Submitted if never decided)
    public string? DecidedUnitName { get; set; }
    public string? DecisionNotes { get; set; }
    public DateTime? ResponseSentAt { get; set; }
    public Guid? CreatedMemberId { get; set; }
    public string? CreatedMemberCardNumber { get; set; }

    public DateTime ArchivedAt { get; set; }
}
