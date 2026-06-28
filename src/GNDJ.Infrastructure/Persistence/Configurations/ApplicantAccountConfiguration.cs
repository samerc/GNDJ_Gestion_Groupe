using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Isolated public-enrollment account (own JWT, never a User/Member) owning a household's demandes.
public class ApplicantAccountConfiguration : IEntityTypeConfiguration<ApplicantAccount>
{
    public void Configure(EntityTypeBuilder<ApplicantAccount> builder)
    {
        builder.ToTable("applicant_accounts");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Email).HasMaxLength(254).IsRequired();
        builder.Property(e => e.PasswordHash).HasMaxLength(500).IsRequired();
        builder.Property(e => e.ContactName).HasMaxLength(200);
        builder.Property(e => e.EmailVerificationToken).HasMaxLength(200);
        builder.Property(e => e.RefreshToken).HasMaxLength(500);
        builder.Property(e => e.PasswordResetToken).HasMaxLength(200);
        builder.Property(e => e.AddressCountry).HasMaxLength(100);
        builder.Property(e => e.AddressCity).HasMaxLength(100);
        builder.Property(e => e.AddressDetails).HasColumnType("text");

        builder.HasIndex(e => e.Email).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.RefreshToken);

        // Household sub-records (shared parents, scout relations, demandes) die with the account.
        builder.HasMany(e => e.Guardians).WithOne(g => g.ApplicantAccount)
            .HasForeignKey(g => g.ApplicantAccountId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(e => e.ScoutRelations).WithOne(r => r.ApplicantAccount)
            .HasForeignKey(r => r.ApplicantAccountId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(e => e.Demandes).WithOne(d => d.ApplicantAccount)
            .HasForeignKey(d => d.ApplicantAccountId).OnDelete(DeleteBehavior.Cascade);
    }
}
