using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class SecurityProfileConfiguration : IEntityTypeConfiguration<SecurityProfile>
{
    public void Configure(EntityTypeBuilder<SecurityProfile> builder)
    {
        builder.ToTable("security_profiles");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.Description).HasColumnType("text");

        builder.HasIndex(e => e.Code).IsUnique().HasFilter("is_deleted = false");
    }
}
