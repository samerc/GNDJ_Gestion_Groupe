using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class CustomFieldConfiguration : IEntityTypeConfiguration<CustomField>
{
    public void Configure(EntityTypeBuilder<CustomField> builder)
    {
        builder.ToTable("custom_fields");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Code).HasMaxLength(50).IsRequired();
        builder.Property(e => e.FieldType).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Options).HasColumnType("text");

        builder.HasIndex(e => e.Code).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.DisplayOrder);
    }
}

public class MemberCustomFieldValueConfiguration : IEntityTypeConfiguration<MemberCustomFieldValue>
{
    public void Configure(EntityTypeBuilder<MemberCustomFieldValue> builder)
    {
        builder.ToTable("member_custom_field_values");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Value).HasMaxLength(500).IsRequired();

        builder.HasOne(e => e.Member).WithMany().HasForeignKey(e => e.MemberId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.CustomField).WithMany(cf => cf.Values).HasForeignKey(e => e.CustomFieldId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => new { e.MemberId, e.CustomFieldId }).IsUnique().HasFilter("is_deleted = false");
        builder.HasIndex(e => e.MemberId);
    }
}
