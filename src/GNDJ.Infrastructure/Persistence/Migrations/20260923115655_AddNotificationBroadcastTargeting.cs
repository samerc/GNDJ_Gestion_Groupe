using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationBroadcastTargeting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "member_group_id",
                table: "notification_broadcasts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "member_ids_json",
                table: "notification_broadcasts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "unit_id",
                table: "notification_broadcasts",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "member_group_id",
                table: "notification_broadcasts");

            migrationBuilder.DropColumn(
                name: "member_ids_json",
                table: "notification_broadcasts");

            migrationBuilder.DropColumn(
                name: "unit_id",
                table: "notification_broadcasts");
        }
    }
}
