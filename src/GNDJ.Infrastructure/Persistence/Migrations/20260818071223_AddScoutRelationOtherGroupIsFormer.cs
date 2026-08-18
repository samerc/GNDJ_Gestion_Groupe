using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddScoutRelationOtherGroupIsFormer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "other_group_is_former",
                table: "applicant_scout_relations",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "other_group_is_former",
                table: "applicant_scout_relations");
        }
    }
}
