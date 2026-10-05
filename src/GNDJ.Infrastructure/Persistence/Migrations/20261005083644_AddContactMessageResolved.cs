using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContactMessageResolved : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "resolved_at",
                table: "contact_messages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "resolved_by_name",
                table: "contact_messages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "resolved_by_user_id",
                table: "contact_messages",
                type: "uuid",
                nullable: true);

            // Messages already answered count as resolved (by whoever replied last).
            migrationBuilder.Sql(@"UPDATE contact_messages SET resolved_at = replied_at, resolved_by_user_id = replied_by_user_id,
                resolved_by_name = 'Réponse envoyée' WHERE replied_at IS NOT NULL AND resolved_at IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "resolved_at",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "resolved_by_name",
                table: "contact_messages");

            migrationBuilder.DropColumn(
                name: "resolved_by_user_id",
                table: "contact_messages");
        }
    }
}
