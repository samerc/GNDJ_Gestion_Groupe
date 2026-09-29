using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMaitrisePlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "maitrise_plan_lines",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    scout_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    functional_role_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    youth_passage_id = table.Column<Guid>(type: "uuid", nullable: true),
                    youth_passage_created = table.Column<bool>(type: "boolean", nullable: false),
                    youth_passage_snapshot = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    applied_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_maitrise_plan_lines", x => x.id);
                    table.ForeignKey(
                        name: "fk_maitrise_plan_lines_functional_roles_functional_role_id",
                        column: x => x.functional_role_id,
                        principalTable: "functional_roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_maitrise_plan_lines_members_member_id",
                        column: x => x.member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_maitrise_plan_lines_units_unit_id",
                        column: x => x.unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_maitrise_plan_lines_assignment_id",
                table: "maitrise_plan_lines",
                column: "assignment_id");

            migrationBuilder.CreateIndex(
                name: "ix_maitrise_plan_lines_functional_role_id",
                table: "maitrise_plan_lines",
                column: "functional_role_id");

            migrationBuilder.CreateIndex(
                name: "ix_maitrise_plan_lines_member_id",
                table: "maitrise_plan_lines",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_maitrise_plan_lines_scout_year_member_id",
                table: "maitrise_plan_lines",
                columns: new[] { "scout_year", "member_id" });

            migrationBuilder.CreateIndex(
                name: "ix_maitrise_plan_lines_unit_id",
                table: "maitrise_plan_lines",
                column: "unit_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "maitrise_plan_lines");
        }
    }
}
