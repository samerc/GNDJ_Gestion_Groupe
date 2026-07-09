using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Frozen trombinoscope PDF per (unit, scout year). PdfData is a bytea blob; one live row per unit+year.
public class TrombinoscopeArchiveConfiguration : IEntityTypeConfiguration<TrombinoscopeArchive>
{
    public void Configure(EntityTypeBuilder<TrombinoscopeArchive> builder)
    {
        builder.ToTable("trombinoscope_archives");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.ScoutYear).HasMaxLength(20).IsRequired();
        builder.Property(t => t.FileName).HasMaxLength(300).IsRequired();
        builder.Property(t => t.PdfData).HasColumnType("bytea").IsRequired();

        builder.HasOne(t => t.Unit).WithMany().HasForeignKey(t => t.UnitId).OnDelete(DeleteBehavior.Cascade);

        // One saved trombinoscope per unit + scout year (re-saving overwrites the existing row).
        builder.HasIndex(t => new { t.UnitId, t.ScoutYear }).IsUnique().HasFilter("is_deleted = false");
    }
}
