using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// A member's proposal (progression / fonction) waiting for a chef's answer. Everything else uses the conventions;
// this only adds the index behind the « Modifications à valider » badge.
public class MemberChangeRequestConfiguration : IEntityTypeConfiguration<MemberChangeRequest>
{
    public void Configure(EntityTypeBuilder<MemberChangeRequest> builder)
    {
        // The pending count runs on every chef's start-up (/auth/bootstrap) and dashboard. Decided requests are kept
        // forever, so a partial index over the few pending ones keeps that count cheap as the table grows.
        builder.HasIndex(e => e.Status) // not MemberId: that would replace the foreign-key index on member_id
            .HasDatabaseName("ix_member_change_requests_pending")
            .HasFilter("status = 'Pending' AND is_deleted = false");
    }
}
