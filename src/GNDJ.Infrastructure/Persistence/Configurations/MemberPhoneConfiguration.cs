using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class MemberPhoneConfiguration : IEntityTypeConfiguration<MemberPhone>
{
    public void Configure(EntityTypeBuilder<MemberPhone> builder)
    {
        builder.ToTable("member_phones");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.CountryCode).HasMaxLength(5).IsRequired();
        builder.Property(e => e.Number).HasMaxLength(30).IsRequired();
        builder.Property(e => e.Type).HasMaxLength(50).IsRequired();

        builder.HasOne(e => e.Member).WithMany(m => m.Phones).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.MemberId);
    }
}
