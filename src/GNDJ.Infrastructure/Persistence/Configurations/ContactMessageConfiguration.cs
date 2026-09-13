using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Public contact-form submissions (in-app inbox). Column lengths mirror the SendContactMessageCommand
// validator (name 100 / email 254 / subject 150 / message 4000). Indexed on (is_read, created_at desc) for
// the inbox's default "unread first, newest first" listing.
public class ContactMessageConfiguration : IEntityTypeConfiguration<ContactMessage>
{
    public void Configure(EntityTypeBuilder<ContactMessage> builder)
    {
        builder.ToTable("contact_messages");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.SenderName).HasMaxLength(100);
        builder.Property(e => e.SenderEmail).HasMaxLength(254);
        builder.Property(e => e.Subject).HasMaxLength(150);
        builder.Property(e => e.Message).HasColumnType("text");
        builder.Property(e => e.ReplySubject).HasMaxLength(200);
        builder.Property(e => e.ReplyBody).HasColumnType("text");
        builder.Property(e => e.ClaimedByName).HasMaxLength(200);

        builder.HasIndex(e => new { e.IsRead, e.CreatedAt });
    }
}
