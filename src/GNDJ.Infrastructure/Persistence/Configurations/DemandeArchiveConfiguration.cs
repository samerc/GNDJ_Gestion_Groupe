using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Permanent, denormalized snapshot of a demande + its outcome, written when a campaign is closed. No FKs
// (the live demande + applicant data are deleted afterwards), so nothing here cascades or restricts.
public class DemandeArchiveConfiguration : IEntityTypeConfiguration<DemandeArchive>
{
    public void Configure(EntityTypeBuilder<DemandeArchive> builder)
    {
        builder.ToTable("demande_archives");
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
        builder.Property(e => e.PhoneNumber).HasMaxLength(30);
        builder.Property(e => e.Email).HasMaxLength(254);
        builder.Property(e => e.ParentNotes).HasColumnType("text");
        builder.Property(e => e.PreviousDemandeYear).HasMaxLength(20);
        builder.Property(e => e.AccountEmail).HasMaxLength(254);
        builder.Property(e => e.ContactName).HasMaxLength(200);
        builder.Property(e => e.AddressCity).HasMaxLength(100);
        builder.Property(e => e.Status).HasMaxLength(20);
        builder.Property(e => e.DecidedUnitName).HasMaxLength(200);
        builder.Property(e => e.DecisionNotes).HasColumnType("text");
        builder.Property(e => e.CreatedMemberCardNumber).HasMaxLength(20);

        builder.HasIndex(e => e.ScoutYear);
    }
}
