using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// One of a member's postal addresses (a member may have several).
public class MemberAddressConfiguration : IEntityTypeConfiguration<MemberAddress>
{
    public void Configure(EntityTypeBuilder<MemberAddress> builder)
    {
        builder.ToTable("member_addresses");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Type).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Country).HasMaxLength(100).HasDefaultValue("Canada");
        builder.Property(e => e.City).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Details).HasColumnType("text");

        // Cascade: a contact row is meaningless without its member.
        builder.HasOne(e => e.Member).WithMany(m => m.Addresses).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.MemberId);
    }
}
