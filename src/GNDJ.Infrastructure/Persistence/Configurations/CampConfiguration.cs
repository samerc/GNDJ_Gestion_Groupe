using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class CampConfiguration : IEntityTypeConfiguration<Camp>
{
    public void Configure(EntityTypeBuilder<Camp> builder)
    {
        builder.ToTable("camps");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(150).IsRequired();
        builder.Property(e => e.ScoutYear).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Status).HasMaxLength(20).IsRequired();
        builder.Property(e => e.NoteBranchMultipliers).HasColumnType("jsonb");

        builder.HasMany(e => e.Familles).WithOne(f => f.Camp).HasForeignKey(f => f.CampId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(e => e.Participants).WithOne(p => p.Camp).HasForeignKey(p => p.CampId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(e => e.Games).WithOne(g => g.Camp).HasForeignKey(g => g.CampId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class FamilleConfiguration : IEntityTypeConfiguration<Famille>
{
    public void Configure(EntityTypeBuilder<Famille> builder)
    {
        builder.ToTable("camp_familles");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100);

        builder.HasOne(e => e.PereMember).WithMany().HasForeignKey(e => e.PereMemberId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(e => e.MereMember).WithMany().HasForeignKey(e => e.MereMemberId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(e => new { e.CampId, e.Number });
    }
}

public class CampParticipantConfiguration : IEntityTypeConfiguration<CampParticipant>
{
    public void Configure(EntityTypeBuilder<CampParticipant> builder)
    {
        builder.ToTable("camp_participants");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Branche).HasMaxLength(100);
        builder.Property(e => e.Gender).HasMaxLength(20);
        builder.Property(e => e.Role).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Notes).HasColumnType("text");

        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Famille).WithMany().HasForeignKey(e => e.FamilleId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(e => new { e.CampId, e.MemberId }).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.FamilleId);
    }
}

public class CampGameConfiguration : IEntityTypeConfiguration<CampGame>
{
    public void Configure(EntityTypeBuilder<CampGame> builder)
    {
        builder.ToTable("camp_games");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(150).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        builder.HasMany(e => e.Etapistes).WithOne(x => x.CampGame).HasForeignKey(x => x.CampGameId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class CampGameEtapisteConfiguration : IEntityTypeConfiguration<CampGameEtapiste>
{
    public void Configure(EntityTypeBuilder<CampGameEtapiste> builder)
    {
        builder.ToTable("camp_game_etapistes");
        builder.HasKey(e => e.Id);
        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(e => new { e.CampGameId, e.MemberId }).IsUnique().HasFilter("is_deleted = false");
    }
}
