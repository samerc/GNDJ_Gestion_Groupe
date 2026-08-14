namespace GNDJ.Domain.Entities;

// An additional file/page of a MemberDocument. A document's first file lives inline on MemberDocument
// (FilePath/FileName/…) = page 1; extra pages (e.g. the back of an ID card, or pages 2+ of a scan) are stored
// here. So a single reviewable document can hold several files, and the CU approves the whole document once.
// Deliberately a plain entity (not BaseEntity): it's a child file record — no audit/soft-delete of its own;
// it lives and dies with its parent document (cascade delete), which itself carries the review workflow.
public class MemberDocumentPage
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid MemberDocumentId { get; set; }
    public string FilePath { get; set; } = string.Empty; // path under the uploads root (traversal-guarded)
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public int PageOrder { get; set; }                   // 2, 3, … (page 1 is the parent's inline file)
    public DateTime CreatedAt { get; set; }

    public MemberDocument MemberDocument { get; set; } = null!;
}
