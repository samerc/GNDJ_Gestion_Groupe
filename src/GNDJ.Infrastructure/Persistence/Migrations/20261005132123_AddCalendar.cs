using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCalendar : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "calendar_feed_token",
                table: "members",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "calendar_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    audience = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    unit_type_id = table.Column<Guid>(type: "uuid", nullable: true),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recurrence = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    recurrence_interval = table.Column<int>(type: "integer", nullable: false),
                    recurrence_until = table.Column<DateOnly>(type: "date", nullable: true),
                    exception_dates_json = table.Column<string>(type: "text", nullable: true),
                    reminder_minutes = table.Column<int>(type: "integer", nullable: true),
                    publish_on_site = table.Column<bool>(type: "boolean", nullable: false),
                    public_event_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_by_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_calendar_events", x => x.id);
                    table.ForeignKey(
                        name: "fk_calendar_events_unit_types_unit_type_id",
                        column: x => x.unit_type_id,
                        principalTable: "unit_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_calendar_events_units_unit_id",
                        column: x => x.unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "calendar_reminders_sent",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    calendar_event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    occurrence_date = table.Column<DateOnly>(type: "date", nullable: false),
                    sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_calendar_reminders_sent", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_members_calendar_feed_token",
                table: "members",
                column: "calendar_feed_token",
                unique: true,
                filter: "calendar_feed_token IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_calendar_events_audience_unit_id",
                table: "calendar_events",
                columns: new[] { "audience", "unit_id" });

            migrationBuilder.CreateIndex(
                name: "ix_calendar_events_start_date",
                table: "calendar_events",
                column: "start_date");

            migrationBuilder.CreateIndex(
                name: "ix_calendar_events_unit_id",
                table: "calendar_events",
                column: "unit_id");

            migrationBuilder.CreateIndex(
                name: "ix_calendar_events_unit_type_id",
                table: "calendar_events",
                column: "unit_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_calendar_reminders_sent_calendar_event_id_occurrence_date",
                table: "calendar_reminders_sent",
                columns: new[] { "calendar_event_id", "occurrence_date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "calendar_events");

            migrationBuilder.DropTable(
                name: "calendar_reminders_sent");

            migrationBuilder.DropIndex(
                name: "ix_members_calendar_feed_token",
                table: "members");

            migrationBuilder.DropColumn(
                name: "calendar_feed_token",
                table: "members");
        }
    }
}
