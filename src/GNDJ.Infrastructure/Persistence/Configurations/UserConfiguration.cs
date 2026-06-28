using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Login account (BCrypt hash + refresh/reset tokens), one-to-one with an optional Member.
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Email).HasMaxLength(254).IsRequired();
        builder.Property(e => e.PasswordHash).HasMaxLength(500).IsRequired();
        builder.Property(e => e.RefreshToken).HasMaxLength(500);
        builder.Property(e => e.PasswordResetToken).HasMaxLength(500);

        // Restrict: a member with a login can't be hard-deleted without first detaching the account.
        builder.HasOne(e => e.Member).WithOne(m => m.User).HasForeignKey<User>(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Email).IsUnique().HasFilter("is_deleted = false");
        // At most one live account per member (enforces the 1:1 over soft-deleted rows).
        builder.HasIndex(e => e.MemberId).IsUnique().HasFilter("is_deleted = false");
        // Partial index over only token-bearing rows — supports the indexed refresh-token lookup on /refresh.
        builder.HasIndex(e => e.RefreshToken).HasFilter("refresh_token IS NOT NULL");
    }
}
