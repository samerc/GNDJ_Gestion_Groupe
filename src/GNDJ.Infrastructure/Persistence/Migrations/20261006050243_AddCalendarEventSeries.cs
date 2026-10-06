using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCalendarEventSeries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "series_date",
                table: "calendar_events",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "series_event_id",
                table: "calendar_events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_calendar_events_series_event_id",
                table: "calendar_events",
                column: "series_event_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_calendar_events_series_event_id",
                table: "calendar_events");

            migrationBuilder.DropColumn(
                name: "series_date",
                table: "calendar_events");

            migrationBuilder.DropColumn(
                name: "series_event_id",
                table: "calendar_events");
        }
    }
}
