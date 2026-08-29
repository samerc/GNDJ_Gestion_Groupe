using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// The central person record (youth or leader). Aggregates contacts, guardians, assignments, documents,
// cotisations and progressions. An optional 1:1 User gives login. "Active" membership is derived from
// having an assignment with EndDate == null; members with only ended assignments are alumni (kept, not deleted).
public class Member : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    // Internal matricule (auto-generated M-####/F-####). Always present, unique, used for cards & lists.
    public string? CardNumber { get; set; }
    // Official SDL/GDL card number ("Numéro de carte") — nullable, set when known.
    public string? ExternalCardNumber { get; set; }
    public string? BloodType { get; set; }
    public string? Nationality { get; set; }
    public string? School { get; set; }
    public string? Classe { get; set; }
    public string? Section { get; set; }
    // Profession (domain/category, from the managed `member.profession_domains` list) — for older members who
    // are no longer in a school class (Clan, Noyau, maîtrise). Classe and Profession are mutually the "situation":
    // youth fill Classe/Section, working members fill Profession. The member area shows a "Situation" radio
    // (Scolarisé / En activité) that toggles which side is shown; the hidden side is cleared on save.
    public string? ProfessionDomain { get; set; }
    // Free-text job title / details (e.g. "Ingénieur logiciel"), paired with ProfessionDomain (the category).
    // Mirrors the guardian model (Domaine = category + Profession = free-text title).
    public string? Profession { get; set; }
    public string? MedicalNotes { get; set; }
    public string? Allergies { get; set; }
    public string? Notes { get; set; }
    public string? PhotoPath { get; set; }
    // Designated "primary contact email" for member-facing mail (password reset, etc.). Chosen from the
    // member's own emails or a guardian's; null = auto-resolve (member's own email first, else a guardian's).
    public string? PrimaryContactEmail { get; set; }

    // Membership "on hold" — set at the end of the document-verification campaign for members whose dossier is
    // still incomplete. The member can still log in but their document upload is disabled and a suspended banner
    // is shown ("contactez la maîtrise de groupe"); the CG clears it (reactivates) from the verification page.
    public bool IsOnHold { get; set; }
    public DateTime? OnHoldAt { get; set; }

    // When a member becomes a leader (CU/CG…), they're asked once on login to confirm their PERSONAL contact
    // details — email + phone (many still had a parent's on file). Set when they confirm/correct them; null =
    // not yet confirmed → the app shows a one-time blocking "verify your contact details" screen to leaders.
    public DateTime? ContactVerifiedAt { get; set; }

    // First-login welcome tour: set when the member dismisses/finishes the onboarding carousel, so it never
    // shows again (server-side, not localStorage — survives switching device/browser). Null = not yet seen.
    // Only shown to regular members (not chefs — they get the printed guide).
    public DateTime? OnboardingSeenAt { get; set; }

    // Confirmed fratrie: members sharing a SiblingGroupId are brothers/sisters (set by the CG on the Fratries
    // page). Null = not (yet) grouped. See SiblingGroup.
    public Guid? SiblingGroupId { get; set; }
    public SiblingGroup? SiblingGroup { get; set; }

    // Access delegation ("accès délégué") — extra permissions granted to THIS member without any assignment or
    // visible role, set by the CG/super-admin (roles.manage_group). Invisible everywhere (no role shows on the
    // public site / maîtrises). Two uses: a full "Chef de Groupe entrant" hand-off (the incoming CG works before
    // the role is formally set / in case the outgoing CG is unavailable), or a granular per-area grant (e.g. give
    // one ACG "Camp BP" only). The perms are merged into the JWT at the next login/refresh (see AuthAccess).
    // DelegatedPermissionsJson = a JSON array of permission strings (null/empty = no delegation).
    public string? DelegatedPermissionsJson { get; set; }
    // When true, the delegation also grants group-wide access (all units) — set by the full-CG preset so the
    // stand-in can act across the whole group. Granular area grants leave this false (the person keeps their own
    // unit scope + the delegated area perms).
    public bool DelegatedGroupAccess { get; set; }

    public User? User { get; set; }
    public ICollection<MemberPhone> Phones { get; set; } = [];
    public ICollection<MemberEmail> Emails { get; set; } = [];
    public ICollection<MemberAddress> Addresses { get; set; } = [];
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
    public ICollection<GuardianLink> GuardianLinks { get; set; } = [];
    public ICollection<MemberDocument> Documents { get; set; } = [];
    public ICollection<MemberCotisation> Cotisations { get; set; } = [];
    public ICollection<MemberProgression> Progressions { get; set; } = [];
}
