using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAssignmentHotIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_member_assignments_start_end",
                table: "member_assignments",
                columns: new[] { "start_date", "end_date" },
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_member_assignments_unit_active",
                table: "member_assignments",
                column: "unit_id",
                filter: "end_date IS NULL AND is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_member_assignments_start_end",
                table: "member_assignments");

            migrationBuilder.DropIndex(
                name: "ix_member_assignments_unit_active",
                table: "member_assignments");
        }
    }
}
