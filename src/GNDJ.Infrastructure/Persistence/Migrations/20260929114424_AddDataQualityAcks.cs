using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDataQualityAcks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "data_quality_acks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    check_key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    signature = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ack_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ack_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    ack_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_quality_acks", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_data_quality_acks_check_key_member_id",
                table: "data_quality_acks",
                columns: new[] { "check_key", "member_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "data_quality_acks");
        }
    }
}
