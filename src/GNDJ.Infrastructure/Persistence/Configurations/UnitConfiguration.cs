using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A concrete unit (e.g. a specific Meute) of a given branch type, optionally owned by an association.
public class UnitConfiguration : IEntityTypeConfiguration<Unit>
{
    public void Configure(EntityTypeBuilder<Unit> builder)
    {
        builder.ToTable("units");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");
        builder.Property(e => e.Slug).HasMaxLength(120);
        builder.HasIndex(e => e.Slug).IsUnique().HasFilter("slug IS NOT NULL AND is_deleted = false");

        // AssociationId is nullable: a unit may be inter-associations / belong to none (e.g. Maîtrise de Groupe).
        builder.HasOne(e => e.Association).WithMany(a => a.Units).HasForeignKey(e => e.AssociationId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.UnitType).WithMany(ut => ut.Units).HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.AssociationId);
        builder.HasIndex(e => e.UnitTypeId);
        // Code is unique only within an association (the same code may recur across associations).
        builder.HasIndex(e => new { e.Code, e.AssociationId }).IsUnique().HasFilter("is_deleted = false");
    }
}
