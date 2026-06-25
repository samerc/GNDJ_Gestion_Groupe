using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCampBp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "camps",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    scout_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    familles_count = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false),
                    note_force_coef = table.Column<double>(type: "double precision", nullable: false),
                    note_offset = table.Column<double>(type: "double precision", nullable: false),
                    note_branch_multipliers = table.Column<string>(type: "jsonb", nullable: true),
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
                    table.PrimaryKey("pk_camps", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "camp_familles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    pere_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    mere_member_id = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("pk_camp_familles", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_familles_camps_camp_id",
                        column: x => x.camp_id,
                        principalTable: "camps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_camp_familles_members_mere_member_id",
                        column: x => x.mere_member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_camp_familles_members_pere_member_id",
                        column: x => x.pere_member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "camp_games",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("pk_camp_games", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_games_camps_camp_id",
                        column: x => x.camp_id,
                        principalTable: "camps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "camp_participants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: true),
                    unit_type_id = table.Column<Guid>(type: "uuid", nullable: true),
                    branche = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    gender = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    is_attending = table.Column<bool>(type: "boolean", nullable: false),
                    force = table.Column<int>(type: "integer", nullable: true),
                    annee = table.Column<int>(type: "integer", nullable: true),
                    note = table.Column<double>(type: "double precision", nullable: true),
                    is_leader_candidate = table.Column<bool>(type: "boolean", nullable: false),
                    role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    famille_id = table.Column<Guid>(type: "uuid", nullable: true),
                    notes = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("pk_camp_participants", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_participants_camps_camp_id",
                        column: x => x.camp_id,
                        principalTable: "camps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_camp_participants_familles_famille_id",
                        column: x => x.famille_id,
                        principalTable: "camp_familles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_camp_participants_members_member_id",
                        column: x => x.member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "camp_game_etapistes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    camp_game_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("pk_camp_game_etapistes", x => x.id);
                    table.ForeignKey(
                        name: "fk_camp_game_etapistes_camp_games_camp_game_id",
                        column: x => x.camp_game_id,
                        principalTable: "camp_games",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_camp_game_etapistes_members_member_id",
                        column: x => x.member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_camp_familles_camp_id_number",
                table: "camp_familles",
                columns: new[] { "camp_id", "number" });

            migrationBuilder.CreateIndex(
                name: "ix_camp_familles_mere_member_id",
                table: "camp_familles",
                column: "mere_member_id");

            migrationBuilder.CreateIndex(
                name: "ix_camp_familles_pere_member_id",
                table: "camp_familles",
                column: "pere_member_id");

            migrationBuilder.CreateIndex(
                name: "ix_camp_game_etapistes_camp_game_id_member_id",
                table: "camp_game_etapistes",
                columns: new[] { "camp_game_id", "member_id" },
                unique: true,
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_camp_game_etapistes_member_id",
                table: "camp_game_etapistes",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_camp_games_camp_id",
                table: "camp_games",
                column: "camp_id");

            migrationBuilder.CreateIndex(
                name: "ix_camp_participants_camp_id_member_id",
                table: "camp_participants",
                columns: new[] { "camp_id", "member_id" },
                unique: true,
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_camp_participants_famille_id",
                table: "camp_participants",
                column: "famille_id");

            migrationBuilder.CreateIndex(
                name: "ix_camp_participants_member_id",
                table: "camp_participants",
                column: "member_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "camp_game_etapistes");

            migrationBuilder.DropTable(
                name: "camp_participants");

            migrationBuilder.DropTable(
                name: "camp_games");

            migrationBuilder.DropTable(
                name: "camp_familles");

            migrationBuilder.DropTable(
                name: "camps");
        }
    }
}
