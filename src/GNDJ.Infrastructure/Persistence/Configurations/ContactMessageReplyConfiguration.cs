using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Reply history of the contact inbox (one row per reply sent). Deleted with its message.
public class ContactMessageReplyConfiguration : IEntityTypeConfiguration<ContactMessageReply>
{
    public void Configure(EntityTypeBuilder<ContactMessageReply> builder)
    {
        builder.ToTable("contact_message_replies");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Subject).HasMaxLength(200);
        builder.Property(e => e.Body).HasColumnType("text");
        builder.Property(e => e.SentTo).HasMaxLength(254);
        builder.Property(e => e.RepliedByName).HasMaxLength(200);
        builder.HasOne(e => e.ContactMessage).WithMany(m => m.Replies)
            .HasForeignKey(e => e.ContactMessageId).OnDelete(DeleteBehavior.Cascade);
        // Matches the parent's soft-delete filter (a child of a filtered entity needs one too).
        builder.HasQueryFilter(e => !e.ContactMessage.IsDeleted);
        builder.HasIndex(e => new { e.ContactMessageId, e.CreatedAt });
    }
}
