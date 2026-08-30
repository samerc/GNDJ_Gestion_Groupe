using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberGroupPerUnit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "per_unit",
                table: "member_groups",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Preserve behaviour: existing branch (UnitType) groups were already treated as per-unit by the
            // réunion logic (they appeared inside each unit, resolved per unit). Flag them per_unit=true so
            // nothing changes for them; the "combined branch" option is only for NEW/edited groups.
            migrationBuilder.Sql("UPDATE member_groups SET per_unit = true WHERE scope_type = 'UnitType';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "per_unit",
                table: "member_groups");
        }
    }
}
