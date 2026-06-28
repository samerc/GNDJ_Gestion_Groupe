using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// External-integration API key: only its hash is stored; a short prefix indexes the lookup.
public class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.ToTable("api_keys");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100);
        builder.Property(e => e.KeyHash).HasMaxLength(200);
        builder.Property(e => e.KeyPrefix).HasMaxLength(20);
        builder.Property(e => e.Scopes).HasMaxLength(500);

        // Optional member binding (scopes like members:read-own); SetNull if that member is removed.
        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.SetNull);
        // Non-unique prefix index narrows candidates so only matching rows get a hash comparison.
        builder.HasIndex(e => e.KeyPrefix);
    }
}
