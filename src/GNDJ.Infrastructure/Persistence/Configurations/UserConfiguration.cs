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
        builder.Property(e => e.PasswordResetToken).HasMaxLength(500);

        // Restrict: a member with a login can't be hard-deleted without first detaching the account.
        builder.HasOne(e => e.Member).WithOne(m => m.User).HasForeignKey<User>(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Email).IsUnique().HasFilter("is_deleted = false");
        // At most one live account per member (enforces the 1:1 over soft-deleted rows).
        builder.HasIndex(e => e.MemberId).IsUnique().HasFilter("is_deleted = false");
    }
}

// One row per signed-in device (see UserSession). Deleting the login account deletes its sessions.
public class UserSessionConfiguration : IEntityTypeConfiguration<UserSession>
{
    public void Configure(EntityTypeBuilder<UserSession> builder)
    {
        builder.ToTable("user_sessions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.TokenHash).HasMaxLength(100).IsRequired();
        builder.Property(e => e.PreviousTokenHash).HasMaxLength(100);
        builder.Property(e => e.UserAgent).HasMaxLength(500);
        builder.Property(e => e.IpAddress).HasMaxLength(64);
        builder.HasOne(e => e.User).WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
        // /refresh looks a session up by its token hash (or by its previous hash during the grace window).
        builder.HasIndex(e => e.TokenHash).IsUnique();
        builder.HasIndex(e => e.PreviousTokenHash).HasFilter("previous_token_hash IS NOT NULL");
        builder.HasIndex(e => e.UserId);
        // Plain child of a soft-deleted parent: hide the sessions of a soft-deleted account (matching filter).
        builder.HasQueryFilter(e => !e.User.IsDeleted);
    }
}
