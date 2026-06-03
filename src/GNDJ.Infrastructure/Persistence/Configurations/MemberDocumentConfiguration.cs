using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class MemberDocumentConfiguration : IEntityTypeConfiguration<MemberDocument>
{
    public void Configure(EntityTypeBuilder<MemberDocument> builder)
    {
        builder.ToTable("member_documents");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Title).HasMaxLength(200).IsRequired();
        builder.Property(e => e.FilePath).HasMaxLength(500).IsRequired();
        builder.Property(e => e.FileName).HasMaxLength(300).IsRequired();
        builder.Property(e => e.MimeType).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Status).HasMaxLength(20).IsRequired();
        builder.Property(e => e.ReviewNotes).HasColumnType("text");

        builder.HasOne(e => e.Member).WithMany(m => m.Documents).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.DocumentType).WithMany(dt => dt.Documents).HasForeignKey(e => e.DocumentTypeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Reviewer).WithMany().HasForeignKey(e => e.ReviewedBy).OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => e.DocumentTypeId);
        builder.HasIndex(e => e.Status);
        builder.HasIndex(e => e.ExpiryDate);
    }
}
