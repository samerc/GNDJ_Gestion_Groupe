using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class UnitIntakeQuotaConfiguration : IEntityTypeConfiguration<UnitIntakeQuota>
{
    public void Configure(EntityTypeBuilder<UnitIntakeQuota> builder)
    {
        builder.ToTable("unit_intake_quotas");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ScoutYear).HasMaxLength(20);

        builder.HasIndex(e => new { e.UnitId, e.ScoutYear }).IsUnique().HasFilter("is_deleted = false");
        builder.HasOne(e => e.Unit).WithMany()
            .HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Restrict);
    }
}
