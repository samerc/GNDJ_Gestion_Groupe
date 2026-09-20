using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Web Push subscriptions (one per member device). Endpoint is unique globally (per browser+origin), so a
// re-subscribe from the same browser upserts by endpoint. No FK to Member — orphan rows are harmless (the
// sender only ever queries subscriptions of existing members) and it keeps member purge simple.
public class PushSubscriptionConfiguration : IEntityTypeConfiguration<PushSubscription>
{
    public void Configure(EntityTypeBuilder<PushSubscription> builder)
    {
        builder.ToTable("push_subscriptions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Endpoint).IsRequired().HasMaxLength(2000);
        builder.Property(e => e.P256dh).IsRequired().HasMaxLength(300);
        builder.Property(e => e.Auth).IsRequired().HasMaxLength(200);
        builder.Property(e => e.UserAgent).HasMaxLength(400);
        builder.HasIndex(e => e.Endpoint).IsUnique();
        builder.HasIndex(e => e.MemberId);
    }
}
