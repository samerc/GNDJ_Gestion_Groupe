using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// An ordered progression step defined per unit type (the scout's path ladder).
public class ScoutStageConfiguration : IEntityTypeConfiguration<ScoutStage>
{
    public void Configure(EntityTypeBuilder<ScoutStage> builder)
    {
        builder.ToTable("scout_stages");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        builder.HasOne(e => e.UnitType).WithMany().HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.Restrict);

        // Code unique within a unit type (stages are per-type, same code can recur across types).
        builder.HasIndex(e => new { e.UnitTypeId, e.Code }).IsUnique().HasFilter("is_deleted = false");
        // Ordering index for the per-type ladder.
        builder.HasIndex(e => new { e.UnitTypeId, e.DisplayOrder });
    }
}

// A badge defined per unit type, optionally tied to a badge-type stage.
public class BadgeConfiguration : IEntityTypeConfiguration<Badge>
{
    public void Configure(EntityTypeBuilder<Badge> builder)
    {
        builder.ToTable("badges");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        builder.HasOne(e => e.UnitType).WithMany().HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.Restrict);

        // Code unique within a unit type (badges are per-type).
        builder.HasIndex(e => new { e.UnitTypeId, e.Code }).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => new { e.UnitTypeId, e.DisplayOrder });
    }
}

// A member earning a stage (and optionally a badge) on a given date — their progression history.
public class MemberProgressionConfiguration : IEntityTypeConfiguration<MemberProgression>
{
    public void Configure(EntityTypeBuilder<MemberProgression> builder)
    {
        builder.ToTable("member_progressions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Location).HasMaxLength(200);
        builder.Property(e => e.Notes).HasColumnType("text");

        // Cascade with the member; Restrict unit/stage (referenced definitions stay protected);
        // Badge SetNull since the badge is optional on a progression record.
        builder.HasOne(e => e.Member).WithMany(m => m.Progressions).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.Unit).WithMany().HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.ScoutStage).WithMany(s => s.Progressions).HasForeignKey(e => e.ScoutStageId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Badge).WithMany(b => b.Progressions).HasForeignKey(e => e.BadgeId).OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => new { e.MemberId, e.ScoutStageId }).HasFilter("is_deleted = false");
    }
}
