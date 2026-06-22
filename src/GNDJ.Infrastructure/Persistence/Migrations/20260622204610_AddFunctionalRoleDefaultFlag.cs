using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFunctionalRoleDefaultFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_default_for_new_members",
                table: "functional_roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Backfill: preserve current behaviour by marking the existing lowest-rank (base youth) role
            // of each unit type as the default-for-new-members. Only type-specific, live, non-archived roles.
            migrationBuilder.Sql(@"
                UPDATE functional_roles SET is_default_for_new_members = true
                WHERE id IN (
                    SELECT DISTINCT ON (unit_type_id) id
                    FROM functional_roles
                    WHERE unit_type_id IS NOT NULL AND is_deleted = false AND is_archived = false
                    ORDER BY unit_type_id, rank ASC, name ASC
                );");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_default_for_new_members",
                table: "functional_roles");
        }
    }
}
