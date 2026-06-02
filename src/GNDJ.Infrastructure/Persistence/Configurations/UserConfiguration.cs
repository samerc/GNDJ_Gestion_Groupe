using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Email).HasMaxLength(254).IsRequired();
        builder.Property(e => e.PasswordHash).HasMaxLength(500).IsRequired();
        builder.Property(e => e.RefreshToken).HasMaxLength(500);

        builder.HasOne(e => e.Member).WithOne(m => m.User).HasForeignKey<User>(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Email).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.MemberId).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.RefreshToken).HasFilter("refresh_token IS NOT NULL");
    }
}
