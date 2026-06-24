using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIsMaitriseAndUnaccent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_maitrise",
                table: "functional_roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Backfill maîtrise flag = leadership roles (chef-unite / chef-de-groupe profiles); youth
            // (read-only) stays false. Mirrors the WEBDEV T_Fonc CHAMP_MAITRISE that drove the profile.
            migrationBuilder.Sql(@"
                UPDATE functional_roles SET is_maitrise = true
                WHERE security_profile_id IN (
                    SELECT id FROM security_profiles WHERE code IN ('chef-unite','chef-de-groupe') AND is_deleted = false
                );");

            // Accent-insensitive search (unaccent()).
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS unaccent;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_maitrise",
                table: "functional_roles");
        }
    }
}
