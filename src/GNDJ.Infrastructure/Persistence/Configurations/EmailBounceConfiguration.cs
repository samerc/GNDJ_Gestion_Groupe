using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Undeliverable addresses reported by the email providers (one row per address).
public class EmailBounceConfiguration : IEntityTypeConfiguration<EmailBounce>
{
    public void Configure(EntityTypeBuilder<EmailBounce> builder)
    {
        builder.ToTable("email_bounces");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Address).HasMaxLength(254).IsRequired();
        builder.Property(e => e.Kind).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Provider).HasMaxLength(30).IsRequired();
        builder.Property(e => e.Reason).HasMaxLength(500);
        builder.HasIndex(e => e.Address).IsUnique();
    }
}
