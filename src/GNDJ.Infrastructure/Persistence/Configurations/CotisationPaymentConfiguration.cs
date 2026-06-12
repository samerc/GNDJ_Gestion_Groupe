using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class CotisationPaymentConfiguration : IEntityTypeConfiguration<CotisationPayment>
{
    public void Configure(EntityTypeBuilder<CotisationPayment> builder)
    {
        builder.ToTable("cotisation_payments");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Amount).HasPrecision(18, 2);
        builder.Property(e => e.Currency).HasMaxLength(5).IsRequired();
        builder.Property(e => e.PaymentMethod).HasMaxLength(50).IsRequired();

        builder.HasOne(e => e.Cotisation).WithMany(c => c.Payments).HasForeignKey(e => e.CotisationId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.CotisationId);
    }
}
