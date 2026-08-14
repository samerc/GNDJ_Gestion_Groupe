using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Extra files (pages 2+) of a member document. Cascades with its parent document.
public class MemberDocumentPageConfiguration : IEntityTypeConfiguration<MemberDocumentPage>
{
    public void Configure(EntityTypeBuilder<MemberDocumentPage> builder)
    {
        builder.ToTable("member_document_pages");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.FilePath).HasMaxLength(500).IsRequired();
        builder.Property(e => e.FileName).HasMaxLength(300).IsRequired();
        builder.Property(e => e.MimeType).HasMaxLength(100).IsRequired();

        builder.HasOne(e => e.MemberDocument).WithMany(d => d.Pages)
            .HasForeignKey(e => e.MemberDocumentId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.MemberDocumentId);
    }
}
