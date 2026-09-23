using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationBroadcasts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_broadcasts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    sent_by_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sent_by_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    audience_label = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    recipient_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_broadcasts", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_notification_broadcasts_sent_at",
                table: "notification_broadcasts",
                column: "sent_at",
                descending: new bool[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_broadcasts");
        }
    }
}
