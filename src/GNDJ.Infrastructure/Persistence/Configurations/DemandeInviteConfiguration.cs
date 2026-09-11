using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// CG-generated late-submission invitation link (see DemandeInvite). Token is the bearer secret in the URL.
public class DemandeInviteConfiguration : IEntityTypeConfiguration<DemandeInvite>
{
    public void Configure(EntityTypeBuilder<DemandeInvite> builder)
    {
        builder.ToTable("demande_invites");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Token).HasMaxLength(64).IsRequired();
        builder.Property(e => e.ScoutYear).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Label).HasMaxLength(200);
        builder.Property(e => e.Email).HasMaxLength(254);
        // The token is looked up on every claim/register-with-invite → unique index.
        builder.HasIndex(e => e.Token).IsUnique();
    }
}
