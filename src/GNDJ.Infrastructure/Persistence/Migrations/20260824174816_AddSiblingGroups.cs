using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSiblingGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "sibling_group_id",
                table: "members",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "sibling_groups",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("pk_sibling_groups", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "sibling_rejections",
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
                    table.PrimaryKey("pk_sibling_rejections", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_members_sibling_group_id",
                table: "members",
                column: "sibling_group_id");

            migrationBuilder.CreateIndex(
                name: "ix_sibling_rejections_member_a_id_member_b_id",
                table: "sibling_rejections",
                columns: new[] { "member_a_id", "member_b_id" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_members_sibling_groups_sibling_group_id",
                table: "members",
                column: "sibling_group_id",
                principalTable: "sibling_groups",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_members_sibling_groups_sibling_group_id",
                table: "members");

            migrationBuilder.DropTable(
                name: "sibling_groups");

            migrationBuilder.DropTable(
                name: "sibling_rejections");

            migrationBuilder.DropIndex(
                name: "ix_members_sibling_group_id",
                table: "members");

            migrationBuilder.DropColumn(
                name: "sibling_group_id",
                table: "members");
        }
    }
}
