using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// Public self-service account for prospective members / parents applying to join.
// Fully isolated from User/Member — only converted into real members on CG approval.
public class ApplicantAccount : BaseEntity
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? ContactName { get; set; } // person managing the account (usually a parent)

    public bool EmailVerified { get; set; }
    public string? EmailVerificationToken { get; set; }
    public DateTime? EmailVerificationTokenExpiry { get; set; }

    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }

    // Session tracking for the "active sessions" admin view (parent portal). LastLoginAt = original sign-in;
    // LastActivityAt = updated on login AND every token refresh (~15-min heartbeat while active).
    public DateTime? LastLoginAt { get; set; }
    public DateTime? LastActivityAt { get; set; }

    // "Retrouver mes informations" — a one-time code emailed to an address the applicant claims, to prove
    // ownership before we reveal + prefill that family's household data (parents/address/siblings).
    public string? HouseholdLookupEmail { get; set; }
    public string? HouseholdLookupCodeHash { get; set; }
    public DateTime? HouseholdLookupExpiry { get; set; }

    // Shared household address (entered once, copied to each child on approval)
    public string? AddressCountry { get; set; }
    public string? AddressCity { get; set; }
    public string? AddressDetails { get; set; }
    // Household primary contact email (one per family) — chosen in the wizard, copied to each converted
    // member's PrimaryContactEmail so member-facing mail has a designated address.
    public string? PrimaryContactEmail { get; set; }

    // Parents' relationship status (Unis / Séparés / Divorcés) — captured in the wizard, shown to the CG in review.
    public string? ParentsSituation { get; set; }

    public bool IsActive { get; set; } = true;

    // When the account holder accepted the inscription terms & conditions (at registration). Null = not
    // accepted (only possible for accounts created while no terms text was configured).
    public DateTime? TermsAcceptedAt { get; set; }

    public ICollection<ApplicantGuardian> Guardians { get; set; } = [];
    public ICollection<ApplicantScoutRelation> ScoutRelations { get; set; } = [];
    public ICollection<Demande> Demandes { get; set; } = [];
}
