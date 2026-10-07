using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Last online-form answers per member + document type (pre-fill for next time). Deleted with the member or the type.
public class MemberFormAnswersConfiguration : IEntityTypeConfiguration<MemberFormAnswers>
{
    public void Configure(EntityTypeBuilder<MemberFormAnswers> builder)
    {
        builder.ToTable("member_form_answers");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.AnswersJson).HasColumnType("text").IsRequired();
        builder.Property(e => e.SignerName).HasMaxLength(150);
        builder.Property(e => e.SignerRelation).HasMaxLength(40);
        builder.HasIndex(e => new { e.MemberId, e.DocumentTypeId }).IsUnique();
        builder.HasOne<Member>().WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<DocumentType>().WithMany().HasForeignKey(e => e.DocumentTypeId).OnDelete(DeleteBehavior.Cascade);
    }
}
