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

    // Shared household address (entered once, copied to each child on approval)
    public string? AddressCountry { get; set; }
    public string? AddressCity { get; set; }
    public string? AddressDetails { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<ApplicantGuardian> Guardians { get; set; } = [];
    public ICollection<ApplicantScoutRelation> ScoutRelations { get; set; } = [];
    public ICollection<Demande> Demandes { get; set; } = [];
}
