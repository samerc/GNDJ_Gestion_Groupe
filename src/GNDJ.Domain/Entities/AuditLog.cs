namespace GNDJ.Domain.Entities;

// Append-only record of a mutating action (Old/NewValues as JSON). Not a BaseEntity — never soft-deleted/edited.
public class AuditLog
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    // The MEMBER this action concerns, resolved by AuditService from the entity (a document / assignment /
    // cotisation / progression / passage / login row → its member). Lets the member "Journal" tab show every
    // action on the member's data, not only rows whose EntityId IS the member. Null for non-member entities.
    public Guid? MemberId { get; set; }
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    // DB-generated (STORED) search haystack: accent/lower-folded concatenation of ip/action/entity + the
    // before/after JSON snapshots, backed by a GIN trigram index so the free-text audit search is index-assisted
    // (~100× faster than scanning every row). Maintained entirely by Postgres — never written by the app.
    public string? SearchText { get; private set; }

    public User? User { get; set; }
}
