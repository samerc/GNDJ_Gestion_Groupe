using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUnitPublicFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_published",
                table: "units",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "public_description",
                table: "units",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                table: "units",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_units_slug",
                table: "units",
                column: "slug",
                unique: true,
                filter: "slug IS NOT NULL AND is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_units_slug",
                table: "units");

            migrationBuilder.DropColumn(
                name: "is_published",
                table: "units");

            migrationBuilder.DropColumn(
                name: "public_description",
                table: "units");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "units");
        }
    }
}
