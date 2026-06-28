using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// One of a member's phone numbers (country code + number, a member may have several).
public class MemberPhoneConfiguration : IEntityTypeConfiguration<MemberPhone>
{
    public void Configure(EntityTypeBuilder<MemberPhone> builder)
    {
        builder.ToTable("member_phones");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.CountryCode).HasMaxLength(5).IsRequired();
        builder.Property(e => e.Number).HasMaxLength(30).IsRequired();
        builder.Property(e => e.Type).HasMaxLength(50).IsRequired();

        // Cascade: a contact row is meaningless without its member.
        builder.HasOne(e => e.Member).WithMany(m => m.Phones).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.MemberId);
    }
}
