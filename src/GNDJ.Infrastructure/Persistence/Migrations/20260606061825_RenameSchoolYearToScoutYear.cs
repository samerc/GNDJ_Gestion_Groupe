using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameSchoolYearToScoutYear : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "school_year",
                table: "passages",
                newName: "scout_year");

            migrationBuilder.RenameIndex(
                name: "ix_passages_school_year_member_id",
                table: "passages",
                newName: "ix_passages_scout_year_member_id");

            migrationBuilder.RenameColumn(
                name: "school_year",
                table: "member_cotisations",
                newName: "scout_year");

            migrationBuilder.RenameIndex(
                name: "ix_member_cotisations_member_id_school_year",
                table: "member_cotisations",
                newName: "ix_member_cotisations_member_id_scout_year");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "scout_year",
                table: "passages",
                newName: "school_year");

            migrationBuilder.RenameIndex(
                name: "ix_passages_scout_year_member_id",
                table: "passages",
                newName: "ix_passages_school_year_member_id");

            migrationBuilder.RenameColumn(
                name: "scout_year",
                table: "member_cotisations",
                newName: "school_year");

            migrationBuilder.RenameIndex(
                name: "ix_member_cotisations_member_id_scout_year",
                table: "member_cotisations",
                newName: "ix_member_cotisations_member_id_school_year");
        }
    }
}
