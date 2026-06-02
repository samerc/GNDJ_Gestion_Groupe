using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class Guardian : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Profession { get; set; }
    public bool IsDeceased { get; set; }
    public string? Notes { get; set; }

    public ICollection<GuardianLink> Links { get; set; } = [];
    public ICollection<GuardianPhone> Phones { get; set; } = [];
    public ICollection<GuardianEmail> Emails { get; set; } = [];
}

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
