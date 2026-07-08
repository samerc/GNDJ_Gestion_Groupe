using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicantHouseholdLookup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "household_lookup_code_hash",
                table: "applicant_accounts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "household_lookup_email",
                table: "applicant_accounts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "household_lookup_expiry",
                table: "applicant_accounts",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "household_lookup_code_hash",
                table: "applicant_accounts");

            migrationBuilder.DropColumn(
                name: "household_lookup_email",
                table: "applicant_accounts");

            migrationBuilder.DropColumn(
                name: "household_lookup_expiry",
                table: "applicant_accounts");
        }
    }
}
