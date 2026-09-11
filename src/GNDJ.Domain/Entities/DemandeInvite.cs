using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A CG-generated invitation link that lets ONE specific family submit a demande AFTER the submission window
// has closed, without reopening the portal for everyone. The CG creates one (optionally labelled + bound to an
// email), shares the link, and the person opens it to register (new family) or claim it (existing account). On
// claim the account gets a durable late-submission grant (ApplicantAccount.LateSubmissionUntil = ExpiresAt), so
// the submission gates pass for that account until the invite expires — everyone else stays blocked.
public class DemandeInvite : BaseEntity
{
    public string Token { get; set; } = string.Empty;   // URL-safe random secret carried in the link (unique)
    public string ScoutYear { get; set; } = string.Empty;
    public string? Label { get; set; }                    // CG note so they remember who it's for (e.g. "Famille Haddad")
    public string? Email { get; set; }                    // optional: the family's email, for the CG's reference only
    public DateOnly ExpiresAt { get; set; }               // link validity AND the granted late-submission window

    // Claim tracking — an invite is single-use: once an account uses it (register or claim), it's consumed.
    public Guid? ClaimedByAccountId { get; set; }
    public DateTime? ClaimedAt { get; set; }

    public DateTime? RevokedAt { get; set; }              // CG revoked it (kept for the trail; not deleted)
    public Guid CreatedByUserId { get; set; }             // the CG/user who generated it
}
