using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// One of a member's email addresses (a member may have several).
public class MemberEmailConfiguration : IEntityTypeConfiguration<MemberEmail>
{
    public void Configure(EntityTypeBuilder<MemberEmail> builder)
    {
        builder.ToTable("member_emails");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Address).HasMaxLength(254).IsRequired();
        builder.Property(e => e.Type).HasMaxLength(50).IsRequired();

        // Cascade: a contact row is meaningless without its member.
        builder.HasOne(e => e.Member).WithMany(m => m.Emails).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => e.Address).HasFilter("is_deleted = false");
    }
}
