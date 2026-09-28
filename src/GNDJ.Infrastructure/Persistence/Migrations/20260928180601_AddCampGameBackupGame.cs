using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCampGameBackupGame : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "backup_game_description",
                table: "camp_games",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "backup_game_name",
                table: "camp_games",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "backup_game_description",
                table: "camp_games");

            migrationBuilder.DropColumn(
                name: "backup_game_name",
                table: "camp_games");
        }
    }
}
