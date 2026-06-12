using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUnitTypeProgressions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "unit_type_progressions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    association_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_unit_type_id = table.Column<Guid>(type: "uuid", nullable: false),
                    to_unit_type_id = table.Column<Guid>(type: "uuid", nullable: false),
                    gender = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    path_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
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
                    table.PrimaryKey("pk_unit_type_progressions", x => x.id);
                    table.ForeignKey(
                        name: "fk_unit_type_progressions_associations_association_id",
                        column: x => x.association_id,
                        principalTable: "associations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_unit_type_progressions_unit_types_from_unit_type_id",
                        column: x => x.from_unit_type_id,
                        principalTable: "unit_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_unit_type_progressions_unit_types_to_unit_type_id",
                        column: x => x.to_unit_type_id,
                        principalTable: "unit_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_unit_type_progressions_association_id",
                table: "unit_type_progressions",
                column: "association_id");

            migrationBuilder.CreateIndex(
                name: "ix_unit_type_progressions_from_unit_type_id",
                table: "unit_type_progressions",
                column: "from_unit_type_id");

            migrationBuilder.CreateIndex(
                name: "ix_unit_type_progressions_to_unit_type_id",
                table: "unit_type_progressions",
                column: "to_unit_type_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "unit_type_progressions");
        }
    }
}
