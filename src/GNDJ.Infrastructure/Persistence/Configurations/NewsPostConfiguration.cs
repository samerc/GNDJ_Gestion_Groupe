using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Public-site news article (CMS) with a URL slug and group/unit-type/unit scope tag.
public class NewsPostConfiguration : IEntityTypeConfiguration<NewsPost>
{
    public void Configure(EntityTypeBuilder<NewsPost> builder)
    {
        builder.ToTable("news_posts");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Title).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Slug).HasMaxLength(220).IsRequired();
        builder.Property(e => e.Summary).HasMaxLength(500);
        builder.Property(e => e.BodyHtml).HasColumnType("text");
        builder.Property(e => e.CoverImagePath).HasMaxLength(500);
        // Slug is the public URL key, so it must be unique among live posts.
        builder.HasIndex(e => e.Slug).IsUnique().HasFilter("is_deleted = false");
        // Serves the public listing query (published, newest first).
        builder.HasIndex(e => new { e.IsPublished, e.PublishedAt });
    }
}
