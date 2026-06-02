using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class SecurityProfilePermissionConfiguration : IEntityTypeConfiguration<SecurityProfilePermission>
{
    public void Configure(EntityTypeBuilder<SecurityProfilePermission> builder)
    {
        builder.ToTable("security_profile_permissions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Permission).HasMaxLength(100).IsRequired();

        builder.HasOne(e => e.SecurityProfile).WithMany(sp => sp.Permissions).HasForeignKey(e => e.SecurityProfileId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => new { e.SecurityProfileId, e.Permission }).IsUnique();
    }
}
