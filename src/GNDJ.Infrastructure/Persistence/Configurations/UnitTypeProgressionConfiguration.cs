using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A "parcours scout" edge: from one branch to the next for a gender, driving passage suggestions.
public class UnitTypeProgressionConfiguration : IEntityTypeConfiguration<UnitTypeProgression>
{
    public void Configure(EntityTypeBuilder<UnitTypeProgression> builder)
    {
        builder.ToTable("unit_type_progressions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Gender).HasMaxLength(20);
        builder.Property(e => e.PathType).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Notes).HasMaxLength(500);

        // AssociationId nullable = group-wide path (SDL+GDL merged); paths are distinguished by gender,
        // so the suggestion still works for association-less types (Noyau/G).
        builder.HasOne(e => e.Association).WithMany().HasForeignKey(e => e.AssociationId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(e => e.FromUnitType).WithMany().HasForeignKey(e => e.FromUnitTypeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.ToUnitType).WithMany().HasForeignKey(e => e.ToUnitTypeId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.AssociationId);
    }
}
