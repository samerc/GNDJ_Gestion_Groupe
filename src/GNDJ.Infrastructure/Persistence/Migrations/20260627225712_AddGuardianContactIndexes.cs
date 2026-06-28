using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGuardianContactIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_guardian_phones_number",
                table: "guardian_phones",
                column: "number");

            migrationBuilder.CreateIndex(
                name: "ix_guardian_emails_address",
                table: "guardian_emails",
                column: "address");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_guardian_phones_number",
                table: "guardian_phones");

            migrationBuilder.DropIndex(
                name: "ix_guardian_emails_address",
                table: "guardian_emails");
        }
    }
}
