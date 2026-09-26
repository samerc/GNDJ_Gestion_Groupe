using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCampCommissionRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "familles_access",
                table: "camp_commission_members",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "none");

            migrationBuilder.AddColumn<bool>(
                name: "is_chef",
                table: "camp_commission_members",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_responsable",
                table: "camp_commission_members",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "jeux_access",
                table: "camp_commission_members",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "none");

            migrationBuilder.AddColumn<string>(
                name: "parametres_access",
                table: "camp_commission_members",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "none");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "familles_access",
                table: "camp_commission_members");

            migrationBuilder.DropColumn(
                name: "is_chef",
                table: "camp_commission_members");

            migrationBuilder.DropColumn(
                name: "is_responsable",
                table: "camp_commission_members");

            migrationBuilder.DropColumn(
                name: "jeux_access",
                table: "camp_commission_members");

            migrationBuilder.DropColumn(
                name: "parametres_access",
                table: "camp_commission_members");
        }
    }
}
