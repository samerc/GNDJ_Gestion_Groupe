using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Persistent email outbox. Plain table (not a BaseEntity) — no soft-delete/audit. The sender polls
// (Status, NextAttemptAt) to claim Pending rows that are due, so that pair is indexed.
public class OutboxEmailConfiguration : IEntityTypeConfiguration<OutboxEmail>
{
    public void Configure(EntityTypeBuilder<OutboxEmail> builder)
    {
        builder.ToTable("email_outbox");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.TemplateCode).HasMaxLength(100).IsRequired();
        builder.Property(e => e.ToEmail).HasMaxLength(254).IsRequired();
        builder.Property(e => e.PayloadJson).HasColumnType("jsonb").IsRequired();
        // Store the status as an int (default enum-to-int) so the poll predicate is a cheap integer compare.
        builder.Property(e => e.Status).HasConversion<int>();
        builder.Property(e => e.LastError).HasMaxLength(2000);

        // The sender's hot query: WHERE status = Pending AND next_attempt_at <= now ORDER BY created_at.
        builder.HasIndex(e => new { e.Status, e.NextAttemptAt });
    }
}
