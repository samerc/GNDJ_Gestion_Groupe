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

    // Optional blank form the member downloads, fills, and uploads back (e.g. an authorization form).
    // TemplateFileUrl = the served /content/files URL; TemplateFileName = the original name shown/downloaded.
    // Null = no template (the common case).
    public string? TemplateFileUrl { get; set; }
    public string? TemplateFileName { get; set; }

    public ICollection<MemberDocument> Documents { get; set; } = [];
}
