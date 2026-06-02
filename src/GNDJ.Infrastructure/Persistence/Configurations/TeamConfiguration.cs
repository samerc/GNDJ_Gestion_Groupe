using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class TeamConfiguration : IEntityTypeConfiguration<Team>
{
    public void Configure(EntityTypeBuilder<Team> builder)
    {
        builder.ToTable("teams");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");
        builder.Property(e => e.Totem).HasMaxLength(50);
        builder.Property(e => e.Adjective).HasMaxLength(50);
        builder.Property(e => e.Color1).HasMaxLength(20);
        builder.Property(e => e.Color2).HasMaxLength(20);

        builder.HasOne(e => e.Unit).WithMany(u => u.Teams).HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.UnitId);
        builder.HasIndex(e => new { e.Name, e.UnitId }).IsUnique().HasFilter("is_deleted = false");
    }
}
