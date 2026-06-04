using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberCustomFieldValue : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid CustomFieldId { get; set; }
    public string Value { get; set; } = string.Empty;

    public Member Member { get; set; } = null!;
    public CustomField CustomField { get; set; } = null!;
}
