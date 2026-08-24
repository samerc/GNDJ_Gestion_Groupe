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

        // The parent MemberDocument (a BaseEntity) carries a global soft-delete query filter; this child is a
        // plain entity with a REQUIRED parent, so EF warns the filters are inconsistent (a soft-deleted parent
        // could leave its pages visible). Mirror the parent's filter so pages of a soft-deleted document are
        // excluded too — same pattern as SecurityProfilePermission → SecurityProfile. Silences the startup warning.
        builder.HasQueryFilter(e => !e.MemberDocument.IsDeleted);
    }
}
