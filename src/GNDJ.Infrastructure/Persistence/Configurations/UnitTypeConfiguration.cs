using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class UnitTypeConfiguration : IEntityTypeConfiguration<UnitType>
{
    public void Configure(EntityTypeBuilder<UnitType> builder)
    {
        builder.ToTable("unit_types");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        builder.Property(e => e.Color).HasMaxLength(10);

        builder.HasIndex(e => e.Code).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.Color).IsUnique().HasFilter("is_deleted = false AND color IS NOT NULL");
    }
}
