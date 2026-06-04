using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

public class SmtpServerConfiguration : IEntityTypeConfiguration<SmtpServer>
{
    public void Configure(EntityTypeBuilder<SmtpServer> builder)
    {
        builder.ToTable("smtp_servers");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100);
        builder.Property(e => e.Host).HasMaxLength(200);
        builder.Property(e => e.Username).HasMaxLength(200);
        builder.Property(e => e.Password).HasMaxLength(500);
        builder.Property(e => e.FromEmail).HasMaxLength(200);
        builder.Property(e => e.FromName).HasMaxLength(200);
    }
}

public class EmailTemplateConfiguration : IEntityTypeConfiguration<EmailTemplate>
{
    public void Configure(EntityTypeBuilder<EmailTemplate> builder)
    {
        builder.ToTable("email_templates");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Name).HasMaxLength(100);
        builder.Property(e => e.Code).HasMaxLength(50);
        builder.Property(e => e.Module).HasMaxLength(50);
        builder.Property(e => e.Subject).HasMaxLength(200);
        builder.Property(e => e.BodyHtml).HasColumnType("text");
        builder.Property(e => e.Variables).HasColumnType("text");

        builder.HasOne(e => e.SmtpServer).WithMany().HasForeignKey(e => e.SmtpServerId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(e => e.Code).IsUnique().HasFilter("is_deleted = false");
    }
}
