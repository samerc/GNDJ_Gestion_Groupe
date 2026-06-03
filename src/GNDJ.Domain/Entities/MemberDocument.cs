using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberDocument : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid DocumentTypeId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
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
