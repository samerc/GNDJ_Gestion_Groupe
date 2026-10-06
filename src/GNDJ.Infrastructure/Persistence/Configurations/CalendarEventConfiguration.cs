using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GNDJ.Infrastructure.Persistence.Configurations;

// Group calendar events. Indexed on the start date (window reads) and the audience targets. Removing a unit / unit
// type removes its events (they make no sense without it).
public class CalendarEventConfiguration : IEntityTypeConfiguration<CalendarEvent>
{
    public void Configure(EntityTypeBuilder<CalendarEvent> builder)
    {
        builder.ToTable("calendar_events");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Title).HasMaxLength(200);
        builder.Property(e => e.Description).HasMaxLength(4000);
        builder.Property(e => e.Location).HasMaxLength(200);
        builder.Property(e => e.Audience).HasMaxLength(20);
        builder.Property(e => e.Recurrence).HasMaxLength(20);
        builder.HasOne(e => e.UnitType).WithMany().HasForeignKey(e => e.UnitTypeId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(e => e.Unit).WithMany().HasForeignKey(e => e.UnitId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(e => e.StartDate);
        builder.HasIndex(e => new { e.Audience, e.UnitId });
        builder.HasIndex(e => e.SeriesEventId);
    }
}

// One sent reminder per (event, occurrence date): unique so the reminder job can never send twice.
public class CalendarReminderSentConfiguration : IEntityTypeConfiguration<CalendarReminderSent>
{
    public void Configure(EntityTypeBuilder<CalendarReminderSent> builder)
    {
        builder.ToTable("calendar_reminders_sent");
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => new { e.CalendarEventId, e.OccurrenceDate }).IsUnique();
    }
}
