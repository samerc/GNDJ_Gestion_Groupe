using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

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

        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.CurrentUnit).WithMany().HasForeignKey(e => e.CurrentUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.ProposedUnit).WithMany().HasForeignKey(e => e.ProposedUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.FinalUnit).WithMany().HasForeignKey(e => e.FinalUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.CurrentRole).WithMany().HasForeignKey(e => e.CurrentRoleId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.ProposedRole).WithMany().HasForeignKey(e => e.ProposedRoleId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.FinalRole).WithMany().HasForeignKey(e => e.FinalRoleId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.ScoutYear, e.MemberId }).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.CurrentUnitId);
        builder.HasIndex(e => e.ProposedUnitId);
        builder.HasIndex(e => e.Status);
    }
}
