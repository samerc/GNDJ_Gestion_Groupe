namespace GNDJ.Domain.Entities;

// The answers a family last gave when filling a document type online (« Remplir et signer en ligne »), one row per
// member + document type. Next time the form is opened (typically the next scout year) it starts pre-filled with
// them. Kept apart from the documents on purpose: the yearly new-year cleanup deletes the signed PDFs, not this.
// Plain table (no soft-delete / audit): it's a convenience copy, the signed PDF + audit log are the record.
public class MemberFormAnswers
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid MemberId { get; set; }
    public Guid DocumentTypeId { get; set; }

    // JSON array of { key, label, kind, value } — matched back by label (+ kind) so it survives template edits.
    public string AnswersJson { get; set; } = "[]";
    public string? SignerName { get; set; }
    public string? SignerRelation { get; set; }
    public DateTime UpdatedAt { get; set; }
}
