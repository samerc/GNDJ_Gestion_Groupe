using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowMultipleCotisationsPerYear : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_member_cotisations_member_id_school_year",
                table: "member_cotisations");

            migrationBuilder.CreateIndex(
                name: "ix_member_cotisations_member_id_school_year",
                table: "member_cotisations",
                columns: new[] { "member_id", "school_year" },
                filter: "is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_member_cotisations_member_id_school_year",
                table: "member_cotisations");

            migrationBuilder.CreateIndex(
                name: "ix_member_cotisations_member_id_school_year",
                table: "member_cotisations",
                columns: new[] { "member_id", "school_year" },
                unique: true,
                filter: "is_deleted = false");
        }
    }
}
