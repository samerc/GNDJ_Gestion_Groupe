using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Fratrie (sibling group) + the "not siblings" rejection tombstone.
public class SiblingGroupConfiguration : IEntityTypeConfiguration<SiblingGroup>
{
    public void Configure(EntityTypeBuilder<SiblingGroup> builder)
    {
        builder.ToTable("sibling_groups");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Notes).HasMaxLength(1000);

        // One group ← many members. Deleting a group frees its members (SetNull) rather than deleting them.
        builder.HasMany(g => g.Members).WithOne(m => m.SiblingGroup)
            .HasForeignKey(m => m.SiblingGroupId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class SiblingRejectionConfiguration : IEntityTypeConfiguration<SiblingRejection>
{
    public void Configure(EntityTypeBuilder<SiblingRejection> builder)
    {
        builder.ToTable("sibling_rejections");
        builder.HasKey(e => e.Id);
        // Ids stored normalized (A < B); one tombstone per pair.
        builder.HasIndex(e => new { e.MemberAId, e.MemberBId }).IsUnique();
    }
}
