using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A reusable rule-based member group (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …).
public class MemberGroupConfiguration : IEntityTypeConfiguration<MemberGroup>
{
    public void Configure(EntityTypeBuilder<MemberGroup> builder)
    {
        builder.ToTable("member_groups");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(150).IsRequired();
        builder.Property(e => e.ScopeType).HasMaxLength(20).IsRequired();

        // Optional scope targets — cleared (SetNull) if the referenced unit/type is removed.
        builder.HasOne(e => e.UnitType).WithMany().HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(e => e.Unit).WithMany().HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(e => e.Rules).WithOne(r => r.MemberGroup)
            .HasForeignKey(r => r.MemberGroupId).OnDelete(DeleteBehavior.Cascade);
    }
}

// Plain child of MemberGroup (no soft-delete) — a group's rules are hard-replaced on edit.
public class MemberGroupRuleConfiguration : IEntityTypeConfiguration<MemberGroupRule>
{
    public void Configure(EntityTypeBuilder<MemberGroupRule> builder)
    {
        builder.ToTable("member_group_rules");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Criterion).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Value).HasMaxLength(100);
        builder.HasIndex(e => e.MemberGroupId);

        // Parent MemberGroup carries the global soft-delete filter; mirror it on this plain child so rules of a
        // soft-deleted group are excluded too (silences the inconsistent-filter startup warning).
        builder.HasQueryFilter(e => !e.MemberGroup.IsDeleted);
    }
}
