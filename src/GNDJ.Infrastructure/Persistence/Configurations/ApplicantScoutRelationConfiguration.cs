using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Applicant-declared "proches scouts" (existing/former scouts in the family) to help CG match siblings.
public class ApplicantScoutRelationConfiguration : IEntityTypeConfiguration<ApplicantScoutRelation>
{
    public void Configure(EntityTypeBuilder<ApplicantScoutRelation> builder)
    {
        builder.ToTable("applicant_scout_relations");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Status).HasMaxLength(30);
        builder.Property(e => e.Relationship).HasMaxLength(50);
        builder.Property(e => e.FirstName).HasMaxLength(100);
        builder.Property(e => e.LastName).HasMaxLength(100);
        builder.Property(e => e.LastUnit).HasMaxLength(150);
        builder.Property(e => e.LastFunction).HasMaxLength(150);
        builder.Property(e => e.OtherGroupName).HasMaxLength(200);

        builder.HasIndex(e => e.ApplicantAccountId);
        // Optional link to a matched existing member; null it out if that member is removed (keep the declaration).
        builder.HasOne(e => e.RelatedMember).WithMany()
            .HasForeignKey(e => e.RelatedMemberId).OnDelete(DeleteBehavior.SetNull);
    }
}
