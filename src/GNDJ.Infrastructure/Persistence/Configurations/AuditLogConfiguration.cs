using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Append-only record of who changed what; before/after snapshots kept as jsonb.
public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("audit_logs");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Action).HasMaxLength(50).IsRequired();
        builder.Property(e => e.EntityType).HasMaxLength(100).IsRequired();
        // jsonb (not text) so change snapshots stay queryable.
        builder.Property(e => e.OldValues).HasColumnType("jsonb");
        builder.Property(e => e.NewValues).HasColumnType("jsonb");
        builder.Property(e => e.IpAddress).HasMaxLength(45); // fits IPv6 / IPv4-mapped
        builder.Property(e => e.UserAgent).HasMaxLength(500);

        // Generated STORED search haystack (see AuditLog.SearchText). f_unaccent is our IMMUTABLE wrapper (from
        // the member-search migration); jsonb::text (jsonb_out) is IMMUTABLE too, so the expression is indexable.
        // The GIN trigram index on this column is created in the migration (fluent API can't express gin_trgm_ops).
        builder.Property(e => e.SearchText)
            .HasColumnName("search_text")
            .HasComputedColumnSql(
                "f_unaccent(lower(coalesce(ip_address,'') || ' ' || action || ' ' || entity_type || ' ' || coalesce(old_values::text,'') || ' ' || coalesce(new_values::text,'')))",
                stored: true);

        // SetNull on user delete so the audit trail itself is never lost.
        builder.HasOne(e => e.User).WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.SetNull);

        // Composite index serves the "history for this entity" lookup.
        builder.HasIndex(e => new { e.EntityType, e.EntityId });
        // entity_id alone (any type) serves the member "Journal" tab (subject = memberId), OR'd with user_id.
        builder.HasIndex(e => e.EntityId);
        builder.HasIndex(e => e.UserId);
        // member_id serves the member "Journal" tab (actions on the member's documents/assignments/cotisations…).
        builder.HasIndex(e => e.MemberId);
        // Descending: log viewer reads newest-first.
        builder.HasIndex(e => e.Timestamp).IsDescending();
    }
}
