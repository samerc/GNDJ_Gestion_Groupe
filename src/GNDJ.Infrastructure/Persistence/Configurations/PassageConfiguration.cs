using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// One annual passage line per member: tracks the current → CU-proposed → CG-final unit/role transition.
public class PassageConfiguration : IEntityTypeConfiguration<Passage>
{
    public void Configure(EntityTypeBuilder<Passage> builder)
    {
        builder.ToTable("passages");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ScoutYear).HasMaxLength(20);
        builder.Property(e => e.Status).HasMaxLength(20);
        builder.Property(e => e.CuNotes).HasColumnType("text");
        builder.Property(e => e.CgNotes).HasColumnType("text");

        // Restrict on every FK: a passage is an audit record of a transition — never cascade-delete it
        // (nor the member/unit/role it references) from the other side.
        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.CurrentUnit).WithMany().HasForeignKey(e => e.CurrentUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.ProposedUnit).WithMany().HasForeignKey(e => e.ProposedUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.FinalUnit).WithMany().HasForeignKey(e => e.FinalUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.CurrentRole).WithMany().HasForeignKey(e => e.CurrentRoleId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.ProposedRole).WithMany().HasForeignKey(e => e.ProposedRoleId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.FinalRole).WithMany().HasForeignKey(e => e.FinalRoleId).OnDelete(DeleteBehavior.Restrict);

        // At most one passage line per member per scout year (the completeness gate relies on this).
        builder.HasIndex(e => new { e.ScoutYear, e.MemberId }).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.CurrentUnitId);
        builder.HasIndex(e => e.ProposedUnitId);
        builder.HasIndex(e => e.Status);
    }
}

// Units whose CU finished their passage for a scout year (one row per unit + year).
public class PassageUnitSubmissionConfiguration : IEntityTypeConfiguration<PassageUnitSubmission>
{
    public void Configure(EntityTypeBuilder<PassageUnitSubmission> builder)
    {
        builder.ToTable("passage_unit_submissions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ScoutYear).HasMaxLength(20);
        builder.HasOne(e => e.Unit).WithMany().HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => new { e.ScoutYear, e.UnitId }).IsUnique();
        // Match Unit's soft-delete filter (required relationship) so EF doesn't warn at startup.
        builder.HasQueryFilter(e => !e.Unit.IsDeleted);
    }
}

// Planned maîtrise changes for a scout year (applied with the passage). Plain table, cancel = delete.
public class MaitrisePlanLineConfiguration : IEntityTypeConfiguration<MaitrisePlanLine>
{
    public void Configure(EntityTypeBuilder<MaitrisePlanLine> builder)
    {
        builder.ToTable("maitrise_plan_lines");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ScoutYear).HasMaxLength(20);
        builder.Property(e => e.Kind).HasMaxLength(10);
        builder.Property(e => e.Notes).HasMaxLength(1000);
        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.Unit).WithMany().HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.FunctionalRole).WithMany().HasForeignKey(e => e.FunctionalRoleId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => new { e.ScoutYear, e.MemberId });
        builder.HasIndex(e => e.AssignmentId);
        // Match the parents' soft-delete filters (required relationships) so EF doesn't warn at startup.
        builder.HasQueryFilter(e => !e.Member.IsDeleted && !e.Unit.IsDeleted && !e.FunctionalRole.IsDeleted);
    }
}

// "C'est voulu" confirmations on the Qualité des données page (one per check + member).
public class DataQualityAckConfiguration : IEntityTypeConfiguration<DataQualityAck>
{
    public void Configure(EntityTypeBuilder<DataQualityAck> builder)
    {
        builder.ToTable("data_quality_acks");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.CheckKey).HasMaxLength(50);
        builder.Property(e => e.Signature).HasMaxLength(2000);
        builder.Property(e => e.AckByName).HasMaxLength(200);
        builder.HasIndex(e => new { e.CheckKey, e.MemberId }).IsUnique();
    }
}
