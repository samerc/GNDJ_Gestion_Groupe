using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class MemberCotisationConfiguration : IEntityTypeConfiguration<MemberCotisation>
{
    public void Configure(EntityTypeBuilder<MemberCotisation> builder)
    {
        builder.ToTable("member_cotisations");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ScoutYear).HasMaxLength(20).IsRequired();
        builder.Property(e => e.ReceiptNumber).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Notes).HasColumnType("text");

        builder.HasOne(e => e.Member).WithMany(m => m.Cotisations).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.MemberId);
        // Exemption-only rows ("will not pay") carry an empty receipt number — exclude them from the
        // unique receipt index so several exempt members can coexist.
        builder.HasIndex(e => e.ReceiptNumber).IsUnique().HasFilter("is_deleted = false AND receipt_number <> ''");
        builder.HasIndex(e => new { e.MemberId, e.ScoutYear }).IsUnique().HasFilter("is_deleted = false");
    }
}
