using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class MemberAssignmentConfiguration : IEntityTypeConfiguration<MemberAssignment>
{
    public void Configure(EntityTypeBuilder<MemberAssignment> builder)
    {
        builder.ToTable("member_assignments");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Notes).HasColumnType("text");

        builder.HasOne(e => e.Member).WithMany(m => m.Assignments).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Unit).WithMany(u => u.Assignments).HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Team).WithMany(t => t.Assignments).HasForeignKey(e => e.TeamId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(e => e.FunctionalRole).WithMany(fr => fr.Assignments).HasForeignKey(e => e.FunctionalRoleId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => e.UnitId);
        builder.HasIndex(e => e.TeamId);
        builder.HasIndex(e => new { e.MemberId, e.UnitId }).HasFilter("end_date IS NULL AND is_deleted = false");
    }
}
