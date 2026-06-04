using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIsMaitriseToTeam : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_maitrise",
                table: "teams",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_maitrise",
                table: "teams");
        }
    }
}
