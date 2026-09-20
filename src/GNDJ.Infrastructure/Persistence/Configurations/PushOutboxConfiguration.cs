using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Durable push outbox (see PushOutbox). Index on (status, next_attempt_at) so the sender's "due Pending rows"
// claim is cheap.
public class PushOutboxConfiguration : IEntityTypeConfiguration<PushOutbox>
{
    public void Configure(EntityTypeBuilder<PushOutbox> builder)
    {
        builder.ToTable("push_outbox");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Title).IsRequired().HasMaxLength(300);
        builder.Property(e => e.Body).HasMaxLength(2000);
        builder.Property(e => e.Url).HasMaxLength(500);
        builder.Property(e => e.Type).HasMaxLength(50);
        builder.Property(e => e.LastError).HasMaxLength(2000);
        builder.HasIndex(e => new { e.Status, e.NextAttemptAt });
    }
}
