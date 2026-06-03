using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class Member : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? CardNumber { get; set; }
    public string? BloodType { get; set; }
    public string? Nationality { get; set; }
    public string? School { get; set; }
    public string? MedicalNotes { get; set; }
    public string? Allergies { get; set; }
    public string? Notes { get; set; }
    public string? PhotoPath { get; set; }

    public User? User { get; set; }
    public ICollection<MemberPhone> Phones { get; set; } = [];
    public ICollection<MemberEmail> Emails { get; set; } = [];
    public ICollection<MemberAddress> Addresses { get; set; } = [];
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
    public ICollection<GuardianLink> GuardianLinks { get; set; } = [];
    public ICollection<MemberRelationship> Relationships { get; set; } = [];
    public ICollection<MemberRelationship> InverseRelationships { get; set; } = [];
    public ICollection<MemberDocument> Documents { get; set; } = [];
    public ICollection<MemberCotisation> Cotisations { get; set; } = [];
}
