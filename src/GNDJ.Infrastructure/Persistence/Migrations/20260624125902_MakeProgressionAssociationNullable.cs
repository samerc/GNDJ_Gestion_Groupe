using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MakeProgressionAssociationNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_unit_type_progressions_associations_association_id",
                table: "unit_type_progressions");

            migrationBuilder.AlterColumn<Guid>(
                name: "association_id",
                table: "unit_type_progressions",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddForeignKey(
                name: "fk_unit_type_progressions_associations_association_id",
                table: "unit_type_progressions",
                column: "association_id",
                principalTable: "associations",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            // Merge SDL + GDL: progression paths are now group-wide (distinguished by gender, not
            // association). Detach existing rows from their association.
            migrationBuilder.Sql("UPDATE unit_type_progressions SET association_id = NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_unit_type_progressions_associations_association_id",
                table: "unit_type_progressions");

            migrationBuilder.AlterColumn<Guid>(
                name: "association_id",
                table: "unit_type_progressions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "fk_unit_type_progressions_associations_association_id",
                table: "unit_type_progressions",
                column: "association_id",
                principalTable: "associations",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
