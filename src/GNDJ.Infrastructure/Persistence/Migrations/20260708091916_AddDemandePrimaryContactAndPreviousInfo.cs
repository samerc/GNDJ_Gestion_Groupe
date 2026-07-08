using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDemandePrimaryContactAndPreviousInfo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "has_previous_demande",
                table: "demandes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "previous_demande_year",
                table: "demandes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "primary_contact_email",
                table: "applicant_accounts",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "has_previous_demande",
                table: "demandes");

            migrationBuilder.DropColumn(
                name: "previous_demande_year",
                table: "demandes");

            migrationBuilder.DropColumn(
                name: "primary_contact_email",
                table: "applicant_accounts");
        }
    }
}
