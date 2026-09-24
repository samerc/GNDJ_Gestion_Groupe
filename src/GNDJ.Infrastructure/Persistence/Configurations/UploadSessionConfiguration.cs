using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// "Scan a document with your phone" hand-off sessions. TokenHash is looked up on every phone request, so it's
// unique + indexed; ExpiresAt is indexed for the periodic cleanup of stale rows. No FK to Member — orphan rows
// are harmless and it keeps member purge simple (a session is worthless once expired anyway).
public class UploadSessionConfiguration : IEntityTypeConfiguration<UploadSession>
{
    public void Configure(EntityTypeBuilder<UploadSession> builder)
    {
        builder.ToTable("upload_sessions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.TokenHash).IsRequired().HasMaxLength(100);
        builder.HasIndex(e => e.TokenHash).IsUnique();
        builder.HasIndex(e => e.ExpiresAt);
    }
}
