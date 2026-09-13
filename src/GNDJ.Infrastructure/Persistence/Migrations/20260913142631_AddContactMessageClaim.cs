using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContactMessageClaim : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "notification_mutes_json",
                table: "members",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "claimed_at",
                table: "contact_messages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "claimed_by_name",
                table: "contact_messages",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "claimed_by_user_id",
                table: "contact_messages",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "notification_mutes_json",
                table: "members");

            migrationBuilder.DropColumn(
                name: "claimed_at",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "claimed_by_name",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "claimed_by_user_id",
                table: "contact_messages");
        }
    }
}
