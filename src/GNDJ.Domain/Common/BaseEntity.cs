namespace GNDJ.Domain.Common;

// Base for all persisted entities. Provides a UUIDv7 PK, audit stamps (set by AuditableEntityInterceptor),
// and soft-delete fields. A global EF query filter hides rows where IsDeleted; SoftDeleteInterceptor turns
// a Delete into IsDeleted=true rather than a physical row removal.
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; } // soft-delete flag; filtered out of all queries
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }
}
