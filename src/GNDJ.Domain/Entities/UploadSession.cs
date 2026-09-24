namespace GNDJ.Domain.Entities;

// A short-lived "scan a document with your phone" hand-off session. A leader (or a member on their own laptop)
// opens one on the DESKTOP for a given member; the desktop shows a QR encoding /scan-upload/{token}; the phone
// opens that URL (NO login — the token itself is a scoped, single-purpose capability) and photographs the paper,
// which uploads straight into that member's dossier at the correct document type.
//
// NOT a BaseEntity — ephemeral infrastructure plumbing (no soft-delete/audit). The raw token is never stored;
// only its SHA-256 hash (TokenHash) is, so a leaked DB row can't reconstruct a working link. The token is a
// CAPABILITY: whoever holds the QR may upload to this ONE member — so it is tightly boxed (short expiry,
// upload-only, capped, created only by a user who can already access that member). Worst case if the QR leaks:
// one unwanted document on one member, which a leader reviews before accepting anyway.
public class UploadSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    // SHA-256 (hex) of the raw token that travels in the QR/URL. Looked up by hashing the presented token.
    public string TokenHash { get; set; } = string.Empty;
    // The member whose dossier this session uploads into.
    public Guid MemberId { get; set; }
    // The desktop user who created the session — used as the acting/uploading user for audit + auto-approve.
    public Guid CreatedByUserId { get; set; }
    // Hard expiry (UTC). After this the token no longer works (the phone sees "session expirée").
    public DateTime ExpiresAt { get; set; }
    // Number of files uploaded so far via this session — drives the desktop "N document(s) reçu(s)" live count
    // and caps abuse (a session can upload at most a small number of files).
    public int UploadedCount { get; set; }
    // The last document created/appended by this session (handy for the desktop to jump to it; optional).
    public Guid? LastDocumentId { get; set; }
    public DateTime CreatedAt { get; set; }
}
