using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PassageUnitFinishAndCgChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "cg_modified",
                table: "passages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "final_is_leaving",
                table: "passages",
                type: "boolean",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "passage_unit_submissions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    scout_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: false),
                    submitted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    submitted_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_passage_unit_submissions", x => x.id);
                    table.ForeignKey(
                        name: "fk_passage_unit_submissions_units_unit_id",
                        column: x => x.unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_passage_unit_submissions_scout_year_unit_id",
                table: "passage_unit_submissions",
                columns: new[] { "scout_year", "unit_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_passage_unit_submissions_unit_id",
                table: "passage_unit_submissions",
                column: "unit_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "passage_unit_submissions");

            migrationBuilder.DropColumn(
                name: "cg_modified",
                table: "passages");

            migrationBuilder.DropColumn(
                name: "final_is_leaving",
                table: "passages");
        }
    }
}
