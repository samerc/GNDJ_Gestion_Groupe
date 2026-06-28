using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Master scout-year-startup checklist definitions; assignees/dependencies live in uuid[] array columns
// (mapped by convention, no join tables) and are fanned out into per-year RentreeTasks on generate.
public class RentreeTaskTemplateConfiguration : IEntityTypeConfiguration<RentreeTaskTemplate>
{
    public void Configure(EntityTypeBuilder<RentreeTaskTemplate> b)
    {
        b.Property(e => e.Title).HasMaxLength(200).IsRequired();
        b.Property(e => e.Description).HasMaxLength(2000);
        b.Property(e => e.Phase).HasMaxLength(100).IsRequired();
        b.Property(e => e.AssigneeType).HasMaxLength(20).IsRequired();
        b.Property(e => e.AssigneeRole).HasMaxLength(50);
        b.Property(e => e.DefaultDeadlineLabel).HasMaxLength(100);
    }
}

// Per-scout-year materialized checklist task; per-unit fan-out instances share a templateId.
public class RentreeTaskConfiguration : IEntityTypeConfiguration<RentreeTask>
{
    public void Configure(EntityTypeBuilder<RentreeTask> b)
    {
        b.Property(e => e.ScoutYear).HasMaxLength(20).IsRequired();
        b.Property(e => e.Title).HasMaxLength(200).IsRequired();
        b.Property(e => e.Description).HasMaxLength(2000);
        b.Property(e => e.Phase).HasMaxLength(100).IsRequired();
        b.Property(e => e.AssigneeType).HasMaxLength(20).IsRequired();
        b.Property(e => e.AssigneeRole).HasMaxLength(50);
        b.Property(e => e.DeadlineLabel).HasMaxLength(100);
        b.Property(e => e.Status).HasMaxLength(20).IsRequired();
        b.Property(e => e.CompletedByName).HasMaxLength(200);
        b.HasIndex(e => e.ScoutYear);
        // Group-level tasks have no unit; SetNull keeps the task if its unit is removed.
        b.HasOne(e => e.Unit).WithMany().HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.SetNull);
    }
}
