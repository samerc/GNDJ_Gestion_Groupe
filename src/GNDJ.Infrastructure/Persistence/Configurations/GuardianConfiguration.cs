using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class GuardianConfiguration : IEntityTypeConfiguration<Guardian>
{
    public void Configure(EntityTypeBuilder<Guardian> builder)
    {
        builder.ToTable("guardians");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.FirstName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.LastName).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Profession).HasMaxLength(150);
        builder.Property(e => e.ProfessionDomain).HasMaxLength(100);
        builder.Property(e => e.Notes).HasColumnType("text");

        builder.HasIndex(e => new { e.LastName, e.FirstName });
    }
}

public class GuardianLinkConfiguration : IEntityTypeConfiguration<GuardianLink>
{
    public void Configure(EntityTypeBuilder<GuardianLink> builder)
    {
        builder.ToTable("guardian_links");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.RelationshipType).HasMaxLength(50).IsRequired();

        builder.HasOne(e => e.Guardian).WithMany(g => g.Links).HasForeignKey(e => e.GuardianId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.Member).WithMany(m => m.GuardianLinks).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.GuardianId);
        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => new { e.GuardianId, e.MemberId, e.RelationshipType }).IsUnique().HasFilter("is_deleted = false");
    }
}

public class GuardianPhoneConfiguration : IEntityTypeConfiguration<GuardianPhone>
{
    public void Configure(EntityTypeBuilder<GuardianPhone> builder)
    {
        builder.ToTable("guardian_phones");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.CountryCode).HasMaxLength(5).IsRequired();
        builder.Property(e => e.Number).HasMaxLength(30).IsRequired();
        builder.Property(e => e.Type).HasMaxLength(50).IsRequired();

        builder.HasOne(e => e.Guardian).WithMany(g => g.Phones).HasForeignKey(e => e.GuardianId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => e.GuardianId);
    }
}

public class GuardianEmailConfiguration : IEntityTypeConfiguration<GuardianEmail>
{
    public void Configure(EntityTypeBuilder<GuardianEmail> builder)
    {
        builder.ToTable("guardian_emails");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Address).HasMaxLength(254).IsRequired();
        builder.Property(e => e.Type).HasMaxLength(50).IsRequired();

        builder.HasOne(e => e.Guardian).WithMany(g => g.Emails).HasForeignKey(e => e.GuardianId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => e.GuardianId);
    }
}
