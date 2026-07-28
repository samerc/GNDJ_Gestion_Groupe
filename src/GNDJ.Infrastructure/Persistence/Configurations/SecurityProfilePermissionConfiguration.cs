using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Join row granting one permission string to a security profile.
public class SecurityProfilePermissionConfiguration : IEntityTypeConfiguration<SecurityProfilePermission>
{
    public void Configure(EntityTypeBuilder<SecurityProfilePermission> builder)
    {
        builder.ToTable("security_profile_permissions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Permission).HasMaxLength(100).IsRequired();

        // Cascade: permission grants are owned by the profile and have no life of their own.
        builder.HasOne(e => e.SecurityProfile).WithMany(sp => sp.Permissions).HasForeignKey(e => e.SecurityProfileId).OnDelete(DeleteBehavior.Cascade);

        // One row per (profile, permission) — prevents duplicate grants.
        builder.HasIndex(e => new { e.SecurityProfileId, e.Permission }).IsUnique();

        // Match the parent's soft-delete filter so a permission grant disappears with its (soft-deleted)
        // profile. SecurityProfilePermission isn't a BaseEntity, so without this EF logs a startup warning
        // ("required end of a relationship with a query-filtered entity"). Grants are only ever loaded via
        // their profile anyway; this just makes the filtering explicit and silences the warning.
        builder.HasQueryFilter(e => !e.SecurityProfile.IsDeleted);
    }
}
