using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPassageAndUnitTypeAgeRange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "age_max",
                table: "unit_types",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "age_min",
                table: "unit_types",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "passages",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    school_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_unit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_team_id = table.Column<Guid>(type: "uuid", nullable: true),
                    current_role_id = table.Column<Guid>(type: "uuid", nullable: false),
                    proposed_unit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    proposed_team_id = table.Column<Guid>(type: "uuid", nullable: true),
                    proposed_role_id = table.Column<Guid>(type: "uuid", nullable: false),
                    cu_notes = table.Column<string>(type: "text", nullable: true),
                    final_unit_id = table.Column<Guid>(type: "uuid", nullable: true),
                    final_team_id = table.Column<Guid>(type: "uuid", nullable: true),
                    final_role_id = table.Column<Guid>(type: "uuid", nullable: true),
                    cg_notes = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    proposed_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reviewed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reviewed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("pk_passages", x => x.id);
                    table.ForeignKey(
                        name: "fk_passages_functional_roles_current_role_id",
                        column: x => x.current_role_id,
                        principalTable: "functional_roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_passages_functional_roles_final_role_id",
                        column: x => x.final_role_id,
                        principalTable: "functional_roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_passages_functional_roles_proposed_role_id",
                        column: x => x.proposed_role_id,
                        principalTable: "functional_roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_passages_members_member_id",
                        column: x => x.member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_passages_units_current_unit_id",
                        column: x => x.current_unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_passages_units_final_unit_id",
                        column: x => x.final_unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_passages_units_proposed_unit_id",
                        column: x => x.proposed_unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_passages_current_role_id",
                table: "passages",
                column: "current_role_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_current_unit_id",
                table: "passages",
                column: "current_unit_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_final_role_id",
                table: "passages",
                column: "final_role_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_final_unit_id",
                table: "passages",
                column: "final_unit_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_member_id",
                table: "passages",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_proposed_role_id",
                table: "passages",
                column: "proposed_role_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_proposed_unit_id",
                table: "passages",
                column: "proposed_unit_id");

            migrationBuilder.CreateIndex(
                name: "ix_passages_school_year_member_id",
                table: "passages",
                columns: new[] { "school_year", "member_id" },
                unique: true,
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_passages_status",
                table: "passages",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "passages");

            migrationBuilder.DropColumn(
                name: "age_max",
                table: "unit_types");

            migrationBuilder.DropColumn(
                name: "age_min",
                table: "unit_types");
        }
    }
}
