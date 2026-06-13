using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A parent/guardian on an applicant account — shared across all the account's demandes.
// Converted to a real Guardian (+link) on approval, deduped against existing guardians by email/phone.
public class ApplicantGuardian : BaseEntity
{
    public Guid ApplicantAccountId { get; set; }
    public string Relationship { get; set; } = string.Empty; // Père, Mère, Tuteur, ...
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Profession { get; set; }
    public string? PhoneCountryCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public bool IsDeceased { get; set; }
    public bool IsPrimaryContact { get; set; }
    public bool IsEmergencyContact { get; set; }

    public ApplicantAccount ApplicantAccount { get; set; } = null!;
}
