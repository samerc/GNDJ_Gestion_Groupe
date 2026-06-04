using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "custom_fields",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    field_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    options = table.Column<string>(type: "text", nullable: true),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    show_on_card = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("pk_custom_fields", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "member_custom_field_values",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    custom_field_id = table.Column<Guid>(type: "uuid", nullable: false),
                    value = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
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
                    table.PrimaryKey("pk_member_custom_field_values", x => x.id);
                    table.ForeignKey(
                        name: "fk_member_custom_field_values_custom_fields_custom_field_id",
                        column: x => x.custom_field_id,
                        principalTable: "custom_fields",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_member_custom_field_values_members_member_id",
                        column: x => x.member_id,
                        principalTable: "members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_custom_fields_code",
                table: "custom_fields",
                column: "code",
                unique: true,
                filter: "is_deleted = false");

            migrationBuilder.CreateIndex(
                name: "ix_custom_fields_display_order",
                table: "custom_fields",
                column: "display_order");

            migrationBuilder.CreateIndex(
                name: "ix_member_custom_field_values_custom_field_id",
                table: "member_custom_field_values",
                column: "custom_field_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_custom_field_values_member_id",
                table: "member_custom_field_values",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "ix_member_custom_field_values_member_id_custom_field_id",
                table: "member_custom_field_values",
                columns: new[] { "member_id", "custom_field_id" },
                unique: true,
                filter: "is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "member_custom_field_values");

            migrationBuilder.DropTable(
                name: "custom_fields");
        }
    }
}
