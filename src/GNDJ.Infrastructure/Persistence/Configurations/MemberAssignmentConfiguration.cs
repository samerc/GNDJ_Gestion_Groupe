using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A member's placement in a unit/team/role over a date span; the spine of active-membership scoping.
public class MemberAssignmentConfiguration : IEntityTypeConfiguration<MemberAssignment>
{
    public void Configure(EntityTypeBuilder<MemberAssignment> builder)
    {
        builder.ToTable("member_assignments");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Notes).HasColumnType("text");

        // Restrict member/unit/role deletes (assignment history must survive); Team SetNull because a member
        // can transfer units before the new CU re-assigns a team, leaving the placement temporarily team-less.
        builder.HasOne(e => e.Member).WithMany(m => m.Assignments).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Unit).WithMany(u => u.Assignments).HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Team).WithMany(t => t.Assignments).HasForeignKey(e => e.TeamId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(e => e.FunctionalRole).WithMany(fr => fr.Assignments).HasForeignKey(e => e.FunctionalRoleId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => e.UnitId);
        builder.HasIndex(e => e.TeamId);
        // Partial index over open (end_date IS NULL) assignments — the hot path for PER-MEMBER active lookups.
        builder.HasIndex(e => new { e.MemberId, e.UnitId }).HasFilter("end_date IS NULL AND is_deleted = false");
        // Active-BY-UNIT hot path: "all active members of a unit" (roster, doc matrix, cotisation dashboard,
        // reports, member list). The member-first partial index above can't serve a unit_id-only filter, so
        // without this it falls back to the plain unit_id index and re-reads every historical row for the unit.
        builder.HasIndex(e => e.UnitId, "ix_member_assignments_unit_active")
            .HasFilter("end_date IS NULL AND is_deleted = false")
            .HasDatabaseName("ix_member_assignments_unit_active");
        // Year-range overlap: the CG dashboard counts members active DURING a scout year via a start/end date
        // window (start < windowEnd AND (end IS NULL OR end > windowStart)); no existing index leads on the dates.
        builder.HasIndex(e => new { e.StartDate, e.EndDate }, "ix_member_assignments_start_end")
            .HasFilter("is_deleted = false")
            .HasDatabaseName("ix_member_assignments_start_end");
    }
}
