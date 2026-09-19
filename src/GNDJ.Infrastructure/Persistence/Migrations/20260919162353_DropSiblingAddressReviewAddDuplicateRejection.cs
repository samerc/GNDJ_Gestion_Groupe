using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DropSiblingAddressReviewAddDuplicateRejection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "address_needs_review",
                table: "sibling_groups");

            migrationBuilder.CreateTable(
                name: "member_duplicate_rejections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_a_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_b_id = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("pk_member_duplicate_rejections", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_member_duplicate_rejections_member_a_id_member_b_id",
                table: "member_duplicate_rejections",
                columns: new[] { "member_a_id", "member_b_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "member_duplicate_rejections");

            migrationBuilder.AddColumn<bool>(
                name: "address_needs_review",
                table: "sibling_groups",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
