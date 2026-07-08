using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDemandeArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "demande_archives",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    scout_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    first_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    last_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    date_of_birth = table.Column<DateOnly>(type: "date", nullable: true),
                    gender = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    nationality = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    school = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    classe = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    section = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    blood_type = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    medical_notes = table.Column<string>(type: "text", nullable: true),
                    allergies = table.Column<string>(type: "text", nullable: true),
                    phone_number = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    parent_notes = table.Column<string>(type: "text", nullable: true),
                    has_previous_demande = table.Column<bool>(type: "boolean", nullable: false),
                    previous_demande_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    account_email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    contact_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    address_city = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    decided_unit_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    decision_notes = table.Column<string>(type: "text", nullable: true),
                    response_sent_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_member_card_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    archived_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
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
                    table.PrimaryKey("pk_demande_archives", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_demande_archives_scout_year",
                table: "demande_archives",
                column: "scout_year");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "demande_archives");
        }
    }
}
