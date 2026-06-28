using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A parent/tuteur. Shared across members via GuardianLink (siblings reference the same Guardian), which is
// why guardians are deduped by name+email/phone on import and on demande approval.
public class Guardian : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Profession { get; set; }
    // Activity domain (category) from the managed member.profession_domains list. Profession stays the free-text title.
    public string? ProfessionDomain { get; set; }
    public bool IsDeceased { get; set; }
    public string? Notes { get; set; }

    public ICollection<GuardianLink> Links { get; set; } = [];
    public ICollection<GuardianPhone> Phones { get; set; } = [];
    public ICollection<GuardianEmail> Emails { get; set; } = [];
}

// Join row linking a shared Guardian to a specific Member with their relationship (and contact flags).
public class GuardianLink : BaseEntity
{
    public Guid GuardianId { get; set; }
    public Guid MemberId { get; set; }
    public string RelationshipType { get; set; } = string.Empty; // Père, Mère, Tuteur, TuteurLégal, Autre
    public bool IsPrimaryContact { get; set; }
    public bool IsEmergencyContact { get; set; }

    public Guardian Guardian { get; set; } = null!;
    public Member Member { get; set; } = null!;
}

public class GuardianPhone : BaseEntity
{
    public Guid GuardianId { get; set; }
    public string CountryCode { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsPrimary { get; set; }

    public Guardian Guardian { get; set; } = null!;
}

public class GuardianEmail : BaseEntity
{
    public Guid GuardianId { get; set; }
    public string Address { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsPrimary { get; set; }

    public Guardian Guardian { get; set; } = null!;
}
