using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "member_group_id",
                table: "meetings",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "member_groups",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    scope_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    unit_type_id = table.Column<Guid>(type: "uuid", nullable: true),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: true),
                    is_visible = table.Column<bool>(type: "boolean", nullable: false),
                    is_system = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("pk_member_groups", x => x.id);
                    table.ForeignKey(
                        name: "fk_member_groups_unit_types_unit_type_id",
                        column: x => x.unit_type_id,
                        principalTable: "unit_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_member_groups_units_unit_id",
                        column: x => x.unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "member_group_rules",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    include = table.Column<bool>(type: "boolean", nullable: false),
                    criterion = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    value = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_member_group_rules", x => x.id);
                    table.ForeignKey(
                        name: "fk_member_group_rules_member_groups_member_group_id",
                        column: x => x.member_group_id,
                        principalTable: "member_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_meetings_member_group_id",
                table: "meetings",
                column: "member_group_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_group_rules_member_group_id",
                table: "member_group_rules",
                column: "member_group_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_groups_unit_id",
                table: "member_groups",
                column: "unit_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_groups_unit_type_id",
                table: "member_groups",
                column: "unit_type_id");

            migrationBuilder.AddForeignKey(
                name: "fk_meetings_member_groups_member_group_id",
                table: "meetings",
                column: "member_group_id",
                principalTable: "member_groups",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_meetings_member_groups_member_group_id",
                table: "meetings");

            migrationBuilder.DropTable(
                name: "member_group_rules");

            migrationBuilder.DropTable(
                name: "member_groups");

            migrationBuilder.DropIndex(
                name: "ix_meetings_member_group_id",
                table: "meetings");

            migrationBuilder.DropColumn(
                name: "member_group_id",
                table: "meetings");
        }
    }
}
