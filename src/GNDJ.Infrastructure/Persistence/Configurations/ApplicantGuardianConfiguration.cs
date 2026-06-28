using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Parent/tutor on an applicant household (shared across that account's demandes); converted to a real
// Guardian when a demande is accepted.
public class ApplicantGuardianConfiguration : IEntityTypeConfiguration<ApplicantGuardian>
{
    public void Configure(EntityTypeBuilder<ApplicantGuardian> builder)
    {
        builder.ToTable("applicant_guardians");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Relationship).HasMaxLength(50);
        builder.Property(e => e.FirstName).HasMaxLength(100);
        builder.Property(e => e.LastName).HasMaxLength(100);
        builder.Property(e => e.Profession).HasMaxLength(150);
        builder.Property(e => e.ProfessionDomain).HasMaxLength(100);
        builder.Property(e => e.PhoneCountryCode).HasMaxLength(10);
        builder.Property(e => e.PhoneNumber).HasMaxLength(30);
        builder.Property(e => e.Email).HasMaxLength(254);

        builder.HasIndex(e => e.ApplicantAccountId);
    }
}
