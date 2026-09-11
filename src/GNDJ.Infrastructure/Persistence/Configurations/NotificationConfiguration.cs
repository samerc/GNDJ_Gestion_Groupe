using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// In-app notifications. Plain table (not a BaseEntity) — no soft-delete/audit. The recipient's list query
// filters by member_id and orders by created_at desc; the bell badge counts unread — so (member_id, is_read,
// created_at desc) covers both.
public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("notifications");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Type).HasMaxLength(40).IsRequired();
        builder.Property(e => e.Title).HasMaxLength(300).IsRequired();
        builder.Property(e => e.Body).HasMaxLength(2000);
        builder.Property(e => e.LinkUrl).HasMaxLength(500);

        builder.HasIndex(e => new { e.MemberId, e.IsRead, e.CreatedAt }).IsDescending(false, false, true);
    }
}
