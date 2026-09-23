using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// History of manual notification broadcasts (the CG "Envoyer une notification" sends). Plain table (not a
// BaseEntity). The only query is the manager history list, newest first — so a single index on sent_at desc.
public class NotificationBroadcastConfiguration : IEntityTypeConfiguration<NotificationBroadcast>
{
    public void Configure(EntityTypeBuilder<NotificationBroadcast> builder)
    {
        builder.ToTable("notification_broadcasts");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.SentByName).HasMaxLength(300).IsRequired();
        builder.Property(e => e.Type).HasMaxLength(40).IsRequired();
        builder.Property(e => e.Title).HasMaxLength(300).IsRequired();
        builder.Property(e => e.Body).HasMaxLength(2000);
        builder.Property(e => e.Url).HasMaxLength(500);
        builder.Property(e => e.AudienceLabel).HasMaxLength(500).IsRequired();
        // Denormalized hand-picked members ({id,name}[] JSON) for the resend action — left as unbounded text.

        builder.HasIndex(e => e.SentAt).IsDescending();
    }
}
