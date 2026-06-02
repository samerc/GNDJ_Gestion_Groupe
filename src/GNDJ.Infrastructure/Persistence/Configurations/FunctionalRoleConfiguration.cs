using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class FunctionalRoleConfiguration : IEntityTypeConfiguration<FunctionalRole>
{
    public void Configure(EntityTypeBuilder<FunctionalRole> builder)
    {
        builder.ToTable("functional_roles");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        builder.HasOne(e => e.SecurityProfile).WithMany(sp => sp.FunctionalRoles).HasForeignKey(e => e.SecurityProfileId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.UnitType).WithMany(ut => ut.FunctionalRoles).HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Code).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.SecurityProfileId);
    }
}
