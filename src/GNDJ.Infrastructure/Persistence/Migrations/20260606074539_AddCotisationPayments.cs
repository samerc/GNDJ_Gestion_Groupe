using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCotisationPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Create payments table first, then migrate data, then drop columns
            migrationBuilder.DropIndex(
                name: "ix_member_cotisations_member_id_scout_year",
                table: "member_cotisations");

            migrationBuilder.CreateTable(
                name: "cotisation_payments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    cotisation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    currency = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                    payment_method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_cotisation_payments", x => x.id);
                    table.ForeignKey(
                        name: "fk_cotisation_payments_member_cotisations_cotisation_id",
                        column: x => x.cotisation_id,
                        principalTable: "member_cotisations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Migrate existing cotisation data into payment lines
            migrationBuilder.Sql(@"
                INSERT INTO cotisation_payments (id, cotisation_id, amount, currency, payment_method, created_at, updated_at, is_deleted)
                SELECT gen_random_uuid(), id, amount_paid, currency, payment_method, created_at, updated_at, is_deleted
                FROM member_cotisations
                WHERE amount_paid > 0;
            ");

            // Now drop old columns
            migrationBuilder.DropColumn(name: "amount_paid", table: "member_cotisations");
            migrationBuilder.DropColumn(name: "currency", table: "member_cotisations");
            migrationBuilder.DropColumn(name: "payment_method", table: "member_cotisations");

            migrationBuilder.CreateIndex(
                name: "ix_member_cotisations_member_id_scout_year",
                table: "member_cotisations",
                columns: new[] { "member_id", "scout_year" },
                unique: true,
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_cotisation_payments_cotisation_id",
                table: "cotisation_payments",
                column: "cotisation_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cotisation_payments");

            migrationBuilder.DropIndex(
                name: "ix_member_cotisations_member_id_scout_year",
                table: "member_cotisations");

            migrationBuilder.AddColumn<decimal>(
                name: "amount_paid",
                table: "member_cotisations",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "currency",
                table: "member_cotisations",
                type: "character varying(5)",
                maxLength: 5,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "payment_method",
                table: "member_cotisations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "ix_member_cotisations_member_id_scout_year",
                table: "member_cotisations",
                columns: new[] { "member_id", "scout_year" },
                filter: "is_deleted = false");
        }
    }
}
