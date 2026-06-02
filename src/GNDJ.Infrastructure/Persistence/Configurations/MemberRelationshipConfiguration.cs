using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class MemberRelationshipConfiguration : IEntityTypeConfiguration<MemberRelationship>
{
    public void Configure(EntityTypeBuilder<MemberRelationship> builder)
    {
        builder.ToTable("member_relationships");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.RelationshipType).HasConversion<string>().HasMaxLength(50);
        builder.Property(e => e.Notes).HasColumnType("text");

        builder.HasOne(e => e.Member).WithMany(m => m.Relationships).HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.RelatedMember).WithMany(m => m.InverseRelationships).HasForeignKey(e => e.RelatedMemberId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.MemberId);
        builder.HasIndex(e => e.RelatedMemberId);
        builder.HasIndex(e => new { e.MemberId, e.RelatedMemberId, e.RelationshipType }).IsUnique().HasFilter("is_deleted = false");

        builder.ToTable(t => t.HasCheckConstraint("ck_member_relationships_no_self", "member_id <> related_member_id"));
    }
}
