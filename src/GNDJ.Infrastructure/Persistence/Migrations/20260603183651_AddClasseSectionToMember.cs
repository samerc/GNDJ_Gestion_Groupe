using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddClasseSectionToMember : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "classe",
                table: "members",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "section",
                table: "members",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "classe",
                table: "members");

            migrationBuilder.DropColumn(
                name: "section",
                table: "members");
        }
    }
}
