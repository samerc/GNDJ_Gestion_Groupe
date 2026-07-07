using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Public-site calendar event (CMS) with a URL slug, schedule (start/end date + free-text time), location,
// and a group/unit-type/unit scope tag — mirrors NewsPost.
public class EventConfiguration : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> builder)
    {
        builder.ToTable("events");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Title).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Slug).HasMaxLength(220).IsRequired();
        builder.Property(e => e.Summary).HasMaxLength(500);
        builder.Property(e => e.BodyHtml).HasColumnType("text");
        builder.Property(e => e.CoverImagePath).HasMaxLength(500);
        builder.Property(e => e.TimeLabel).HasMaxLength(80);
        builder.Property(e => e.Location).HasMaxLength(200);
        // Slug is the public URL key, so it must be unique among live events.
        builder.HasIndex(e => e.Slug).IsUnique().HasFilter("is_deleted = false");
        // Serves the public agenda query (published, by date).
        builder.HasIndex(e => new { e.IsPublished, e.StartDate });
    }
}
