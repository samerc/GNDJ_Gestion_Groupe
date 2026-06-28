using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A scouting function within a unit type (e.g. Louveteau, Chef d'unité) bound to a security profile.
public class FunctionalRoleConfiguration : IEntityTypeConfiguration<FunctionalRole>
{
    public void Configure(EntityTypeBuilder<FunctionalRole> builder)
    {
        builder.ToTable("functional_roles");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        // Restrict: a profile/unit-type still referenced by a role must not be deleted out from under it.
        builder.HasOne(e => e.SecurityProfile).WithMany(sp => sp.FunctionalRoles).HasForeignKey(e => e.SecurityProfileId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.UnitType).WithMany(ut => ut.FunctionalRoles).HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Code).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.SecurityProfileId);
    }
}
