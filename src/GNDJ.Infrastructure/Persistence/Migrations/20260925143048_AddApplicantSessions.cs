using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicantSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "applicant_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    applicant_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    previous_token_hash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    rotated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    remember_me = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    last_activity_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    user_agent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ip_address = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_applicant_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_applicant_sessions_applicant_accounts_applicant_account_id",
                        column: x => x.applicant_account_id,
                        principalTable: "applicant_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_applicant_sessions_applicant_account_id",
                table: "applicant_sessions",
                column: "applicant_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_applicant_sessions_previous_token_hash",
                table: "applicant_sessions",
                column: "previous_token_hash",
                filter: "previous_token_hash IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_applicant_sessions_token_hash",
                table: "applicant_sessions",
                column: "token_hash",
                unique: true);

            // Carry over each parent's current sign-in (the old single token per account), so the deploy doesn't
            // sign anyone out. A long remaining lifetime means "Rester connecté" was ticked.
            migrationBuilder.Sql(@"
INSERT INTO applicant_sessions (id, applicant_account_id, token_hash, expires_at, remember_me, created_at, last_activity_at)
SELECT uuidv7(), id, refresh_token, refresh_token_expiry,
       refresh_token_expiry > now() + interval '8 days',
       coalesce(last_login_at, now()), coalesce(last_activity_at, last_login_at, now())
FROM applicant_accounts
WHERE refresh_token IS NOT NULL AND refresh_token_expiry > now() AND is_deleted = false;");

            migrationBuilder.DropIndex(
                name: "ix_applicant_accounts_refresh_token",
                table: "applicant_accounts");

            migrationBuilder.DropColumn(
                name: "refresh_token",
                table: "applicant_accounts");

            migrationBuilder.DropColumn(
                name: "refresh_token_expiry",
                table: "applicant_accounts");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "applicant_sessions");

            migrationBuilder.AddColumn<string>(
                name: "refresh_token",
                table: "applicant_accounts",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "refresh_token_expiry",
                table: "applicant_accounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_applicant_accounts_refresh_token",
                table: "applicant_accounts",
                column: "refresh_token");
        }
    }
}
