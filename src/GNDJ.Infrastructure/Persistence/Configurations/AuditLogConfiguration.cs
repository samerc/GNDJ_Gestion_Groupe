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

        // SetNull on user delete so the audit trail itself is never lost.
        builder.HasOne(e => e.User).WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.SetNull);

        // Composite index serves the "history for this entity" lookup.
        builder.HasIndex(e => new { e.EntityType, e.EntityId });
        builder.HasIndex(e => e.UserId);
        // Descending: log viewer reads newest-first.
        builder.HasIndex(e => e.Timestamp).IsDescending();
    }
}
