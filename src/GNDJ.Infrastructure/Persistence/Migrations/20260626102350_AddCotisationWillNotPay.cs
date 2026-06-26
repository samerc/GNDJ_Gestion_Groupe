using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCotisationWillNotPay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_member_cotisations_receipt_number",
                table: "member_cotisations");

            migrationBuilder.AddColumn<bool>(
                name: "will_not_pay",
                table: "member_cotisations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "ix_member_cotisations_receipt_number",
                table: "member_cotisations",
                column: "receipt_number",
                unique: true,
                filter: "is_deleted = false AND receipt_number <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_member_cotisations_receipt_number",
                table: "member_cotisations");

            migrationBuilder.DropColumn(
                name: "will_not_pay",
                table: "member_cotisations");

            migrationBuilder.CreateIndex(
                name: "ix_member_cotisations_receipt_number",
                table: "member_cotisations",
                column: "receipt_number",
                unique: true,
                filter: "is_deleted = false");
        }
    }
}
