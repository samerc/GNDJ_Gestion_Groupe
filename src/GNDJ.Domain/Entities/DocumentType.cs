using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An admin-defined kind of member document (carte d'identité, certificat médical…). Drives the required-docs
// checklist and the CU documents matrix.
public class DocumentType : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool RequiresExpiry { get; set; }   // document must carry an expiry date (tracked for renewals)
    public bool RequiresApproval { get; set; } // uploads start Pending and need CU/CG approve/reject
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }

    public ICollection<MemberDocument> Documents { get; set; } = [];
}
