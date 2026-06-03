using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class DocumentType : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool RequiresExpiry { get; set; }
    public bool RequiresApproval { get; set; }
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }

    public ICollection<MemberDocument> Documents { get; set; } = [];
}
