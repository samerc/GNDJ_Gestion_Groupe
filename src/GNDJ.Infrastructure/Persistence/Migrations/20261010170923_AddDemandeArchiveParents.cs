using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDemandeArchiveParents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "parent_contact_keys",
                table: "demande_archives",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "parents_summary",
                table: "demande_archives",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "parent_contact_keys",
                table: "demande_archives");

            migrationBuilder.DropColumn(
                name: "parents_summary",
                table: "demande_archives");
        }
    }
}
