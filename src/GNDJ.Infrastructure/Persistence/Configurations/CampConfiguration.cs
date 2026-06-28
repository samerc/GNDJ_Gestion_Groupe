using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A Camp BP edition: splits the group into balanced "familles" and holds the per-camp grading formula.
public class CampConfiguration : IEntityTypeConfiguration<Camp>
{
    public void Configure(EntityTypeBuilder<Camp> builder)
    {
        builder.ToTable("camps");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(150).IsRequired();
        builder.Property(e => e.ScoutYear).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Status).HasMaxLength(20).IsRequired();
        // Per-branch note multipliers serialized as jsonb (a small open-ended branche→coef map).
        builder.Property(e => e.NoteBranchMultipliers).HasColumnType("jsonb");

        // The camp owns its familles/participants/games — deleting the edition cascades them all.
        builder.HasMany(e => e.Familles).WithOne(f => f.Camp).HasForeignKey(f => f.CampId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(e => e.Participants).WithOne(p => p.Camp).HasForeignKey(p => p.CampId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(e => e.Games).WithOne(g => g.Camp).HasForeignKey(g => g.CampId).OnDelete(DeleteBehavior.Cascade);
    }
}

// A mixed "famille" within a camp, led by a Père (male) + Mère (female) leader.
public class FamilleConfiguration : IEntityTypeConfiguration<Famille>
{
    public void Configure(EntityTypeBuilder<Famille> builder)
    {
        builder.ToTable("camp_familles");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100);

        // SetNull: the Père/Mère slots are optional and survive the member being removed (re-assign later).
        builder.HasOne(e => e.PereMember).WithMany().HasForeignKey(e => e.PereMemberId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(e => e.MereMember).WithMany().HasForeignKey(e => e.MereMemberId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(e => new { e.CampId, e.Number });
    }
}

// A member's enrollment + grade in a camp (Branche/Gender snapshotted at grading time); assigned to a famille.
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
        // SetNull on famille so re-running/clearing the draft detaches participants without losing their grades.
        builder.HasOne(e => e.Famille).WithMany().HasForeignKey(e => e.FamilleId).OnDelete(DeleteBehavior.SetNull);
        // A member appears at most once per camp.
        builder.HasIndex(e => new { e.CampId, e.MemberId }).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.FamilleId);
    }
}

// A camp game (phase 2 scoring) and its set of étapiste runners.
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

// Join row pinning a member as an étapiste of a specific game.
public class CampGameEtapisteConfiguration : IEntityTypeConfiguration<CampGameEtapiste>
{
    public void Configure(EntityTypeBuilder<CampGameEtapiste> builder)
    {
        builder.ToTable("camp_game_etapistes");
        builder.HasKey(e => e.Id);
        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        // A member can be listed once per game.
        builder.HasIndex(e => new { e.CampGameId, e.MemberId }).IsUnique().HasFilter("is_deleted = false");
    }
}
