using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailThrottle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "max_per_hour",
                table: "smtp_servers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "smtp_server_id",
                table: "email_outbox",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_email_outbox_smtp_server_id_status_sent_at",
                table: "email_outbox",
                columns: new[] { "smtp_server_id", "status", "sent_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_email_outbox_smtp_server_id_status_sent_at",
                table: "email_outbox");

            migrationBuilder.DropColumn(
                name: "max_per_hour",
                table: "smtp_servers");

            migrationBuilder.DropColumn(
                name: "smtp_server_id",
                table: "email_outbox");
        }
    }
}
