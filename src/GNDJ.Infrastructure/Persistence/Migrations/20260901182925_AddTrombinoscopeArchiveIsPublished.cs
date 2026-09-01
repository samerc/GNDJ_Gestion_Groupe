using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTrombinoscopeArchiveIsPublished : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_published",
                table: "trombinoscope_archives",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Preserve existing behaviour: every trombinoscope saved BEFORE this change was visible to members,
            // so mark all existing rows published. New saves default to unpublished unless the CU opts in.
            migrationBuilder.Sql("UPDATE trombinoscope_archives SET is_published = true;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_published",
                table: "trombinoscope_archives");
        }
    }
}
