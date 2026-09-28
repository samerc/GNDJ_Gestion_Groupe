using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCampRotationScoring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_camp_games_camp_id",
                table: "camp_games");

            migrationBuilder.AddColumn<string>(
                name: "sub_commissions_json",
                table: "camps",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "use_backup_locations",
                table: "camps",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "number",
                table: "camp_games",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "camp_familles",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "super_famille_id",
                table: "camp_familles",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "sub_commissions",
                table: "camp_commission_members",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.CreateTable(
                name: "camp_rotation_matches",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    slot_number = table.Column<int>(type: "integer", nullable: false),
                    game_number = table.Column<int>(type: "integer", nullable: false),
                    famille_a = table.Column<int>(type: "integer", nullable: false),
                    famille_b = table.Column<int>(type: "integer", nullable: false),
                    retard_a = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    retard_b = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    manche1 = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    manche2 = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    esprit_a = table.Column<int>(type: "integer", nullable: true),
                    first_arrived = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    points_a = table.Column<int>(type: "integer", nullable: true),
                    points_b = table.Column<int>(type: "integer", nullable: true),
                    esprit_b = table.Column<int>(type: "integer", nullable: true),
                    enigme = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    scored_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    scored_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    source = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_camp_rotation_matches", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_rotation_matches_camps_camp_id",
                        column: x => x.camp_id,
                        principalTable: "camps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "camp_rotation_slots",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_camp_rotation_slots", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_rotation_slots_camps_camp_id",
                        column: x => x.camp_id,
                        principalTable: "camps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "camp_super_familles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    display_order = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("pk_camp_super_familles", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_super_familles_camps_camp_id",
                        column: x => x.camp_id,
                        principalTable: "camps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_camp_games_camp_id_number",
                table: "camp_games",
                columns: new[] { "camp_id", "number" });

            migrationBuilder.CreateIndex(
                name: "ix_camp_familles_super_famille_id",
                table: "camp_familles",
                column: "super_famille_id");

            migrationBuilder.CreateIndex(
                name: "ix_camp_rotation_matches_camp_id_game_number",
                table: "camp_rotation_matches",
                columns: new[] { "camp_id", "game_number" });

            migrationBuilder.CreateIndex(
                name: "ix_camp_rotation_matches_camp_id_slot_number_game_number",
                table: "camp_rotation_matches",
                columns: new[] { "camp_id", "slot_number", "game_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_camp_rotation_slots_camp_id_number",
                table: "camp_rotation_slots",
                columns: new[] { "camp_id", "number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_camp_super_familles_camp_id",
                table: "camp_super_familles",
                column: "camp_id");

            migrationBuilder.AddForeignKey(
                name: "fk_camp_familles_camp_super_familles_super_famille_id",
                table: "camp_familles",
                column: "super_famille_id",
                principalTable: "camp_super_familles",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_camp_familles_camp_super_familles_super_famille_id",
                table: "camp_familles");

            migrationBuilder.DropTable(
                name: "camp_rotation_matches");

            migrationBuilder.DropTable(
                name: "camp_rotation_slots");

            migrationBuilder.DropTable(
                name: "camp_super_familles");

            migrationBuilder.DropIndex(
                name: "ix_camp_games_camp_id_number",
                table: "camp_games");

            migrationBuilder.DropIndex(
                name: "ix_camp_familles_super_famille_id",
                table: "camp_familles");

            migrationBuilder.DropColumn(
                name: "sub_commissions_json",
                table: "camps");

            migrationBuilder.DropColumn(
                name: "use_backup_locations",
                table: "camps");

            migrationBuilder.DropColumn(
                name: "number",
                table: "camp_games");

            migrationBuilder.DropColumn(
                name: "description",
                table: "camp_familles");

            migrationBuilder.DropColumn(
                name: "super_famille_id",
                table: "camp_familles");

            migrationBuilder.DropColumn(
                name: "sub_commissions",
                table: "camp_commission_members");

            migrationBuilder.CreateIndex(
                name: "ix_camp_games_camp_id",
                table: "camp_games",
                column: "camp_id");
        }
    }
}
