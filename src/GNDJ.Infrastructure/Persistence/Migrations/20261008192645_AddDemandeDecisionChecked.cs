using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDemandeDecisionChecked : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "decision_checked_as",
                table: "demandes",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "decision_checked_as",
                table: "demandes");
        }
    }
}
