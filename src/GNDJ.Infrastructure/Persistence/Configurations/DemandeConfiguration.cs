using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A single child's enrollment request — flows submitted → CG decision → converted to a real Member.
public class DemandeConfiguration : IEntityTypeConfiguration<Demande>
{
    public void Configure(EntityTypeBuilder<Demande> builder)
    {
        builder.ToTable("demandes");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.ScoutYear).HasMaxLength(20);
        builder.Property(e => e.FirstName).HasMaxLength(100);
        builder.Property(e => e.LastName).HasMaxLength(100);
        builder.Property(e => e.Gender).HasMaxLength(20);
        builder.Property(e => e.Nationality).HasMaxLength(100);
        builder.Property(e => e.School).HasMaxLength(200);
        builder.Property(e => e.Classe).HasMaxLength(50);
        builder.Property(e => e.Section).HasMaxLength(20);
        builder.Property(e => e.BloodType).HasMaxLength(10);
        builder.Property(e => e.MedicalNotes).HasColumnType("text");
        builder.Property(e => e.Allergies).HasColumnType("text");
        builder.Property(e => e.PhoneCountryCode).HasMaxLength(10);
        builder.Property(e => e.PhoneNumber).HasMaxLength(30);
        builder.Property(e => e.Email).HasMaxLength(254);
        builder.Property(e => e.ParentNotes).HasColumnType("text");
        builder.Property(e => e.Status).HasMaxLength(20);
        builder.Property(e => e.DecisionNotes).HasColumnType("text");

        builder.HasIndex(e => e.ApplicantAccountId);
        builder.HasIndex(e => e.ScoutYear);
        builder.HasIndex(e => e.Status);

        // Restrict: the accepted unit and the member it produced are decision history — don't let
        // deleting either silently erase the demande.
        builder.HasOne(e => e.DecidedUnit).WithMany()
            .HasForeignKey(e => e.DecidedUnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.CreatedMember).WithMany()
            .HasForeignKey(e => e.CreatedMemberId).OnDelete(DeleteBehavior.Restrict);
    }
}
