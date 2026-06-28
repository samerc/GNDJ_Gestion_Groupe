using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An uploaded file of a given DocumentType for a member. Goes through a Pending → Approved/Rejected
// review workflow (Reviewer/ReviewedAt/ReviewNotes); ExpiryDate drives the dashboard renewal warnings.
public class MemberDocument : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid DocumentTypeId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty; // path on disk under the uploads root (traversal-guarded)
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public string Status { get; set; } = Enums.DocumentStatus.Pending;
    public Guid? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewNotes { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public DateOnly? IssuedDate { get; set; }

    public Member Member { get; set; } = null!;
    public DocumentType DocumentType { get; set; } = null!;
    public User? Reviewer { get; set; }
}
