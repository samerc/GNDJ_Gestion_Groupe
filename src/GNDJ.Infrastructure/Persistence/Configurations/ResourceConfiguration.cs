using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Public-site heritage/knowledge resource (CMS) with a URL slug, category, free-text tags, and
// mp3/PDF/image attachments — mirrors NewsPost.
public class ResourceConfiguration : IEntityTypeConfiguration<Resource>
{
    public void Configure(EntityTypeBuilder<Resource> builder)
    {
        builder.ToTable("resources");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Title).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Slug).HasMaxLength(220).IsRequired();
        builder.Property(e => e.Summary).HasMaxLength(500);
        builder.Property(e => e.BodyHtml).HasColumnType("text");
        builder.Property(e => e.CoverImagePath).HasMaxLength(500);
        builder.Property(e => e.Category).HasMaxLength(40).IsRequired();
        builder.Property(e => e.Tags).HasMaxLength(400);
        builder.Property(e => e.AttachmentsJson).HasColumnType("text");
        // Slug is the public URL key, so it must be unique among live resources.
        builder.HasIndex(e => e.Slug).IsUnique().HasFilter("is_deleted = false");
        // Serves the public library query (published, by category).
        builder.HasIndex(e => new { e.IsPublished, e.Category });
    }
}
