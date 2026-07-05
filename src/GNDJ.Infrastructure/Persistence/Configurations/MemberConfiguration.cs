using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Core scout/leader person record — the hub the whole domain hangs off.
public class MemberConfiguration : IEntityTypeConfiguration<Member>
{
    public void Configure(EntityTypeBuilder<Member> builder)
    {
        builder.ToTable("members");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.FirstName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.LastName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Gender).HasMaxLength(20);
        builder.Property(e => e.CardNumber).HasMaxLength(20);
        builder.Property(e => e.ExternalCardNumber).HasMaxLength(50);
        builder.Property(e => e.BloodType).HasMaxLength(10);
        builder.Property(e => e.Nationality).HasMaxLength(50);
        builder.Property(e => e.School).HasMaxLength(100);
        builder.Property(e => e.MedicalNotes).HasColumnType("text");
        builder.Property(e => e.Allergies).HasColumnType("text");
        builder.Property(e => e.Notes).HasColumnType("text");
        builder.Property(e => e.PhotoPath).HasMaxLength(500);
        builder.Property(e => e.PrimaryContactEmail).HasMaxLength(254);

        builder.HasIndex(e => new { e.LastName, e.FirstName });
        // card_number is the internal matricule (M-/F-), distinct from the official ExternalCardNumber;
        // uniqueness skips nulls so a few legacy rows without a matricule don't collide.
        builder.HasIndex(e => e.CardNumber).IsUnique().HasFilter("is_deleted = false AND card_number IS NOT NULL");
    }
}
