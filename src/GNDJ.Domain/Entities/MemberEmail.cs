using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberEmail : BaseEntity
{
    public Guid MemberId { get; set; }
    public string Address { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // Personnel, Travail, École, Autre
    public bool IsPrimary { get; set; }
    public bool IsEmergency { get; set; }

    public Member Member { get; set; } = null!;
}
