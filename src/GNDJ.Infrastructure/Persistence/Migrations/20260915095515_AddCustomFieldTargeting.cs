using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomFieldTargeting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "applies_to_role",
                table: "custom_fields",
                type: "text",
                nullable: false,
                defaultValue: "all");

            migrationBuilder.AddColumn<string>(
                name: "applies_to_scope",
                table: "custom_fields",
                type: "text",
                nullable: false,
                defaultValue: "all");

            migrationBuilder.AddColumn<Guid>(
                name: "applies_to_unit_id",
                table: "custom_fields",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "applies_to_unit_type_id",
                table: "custom_fields",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "visible_to",
                table: "custom_fields",
                type: "text",
                nullable: false,
                defaultValue: "all");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "applies_to_role",
                table: "custom_fields");

            migrationBuilder.DropColumn(
                name: "applies_to_scope",
                table: "custom_fields");

            migrationBuilder.DropColumn(
                name: "applies_to_unit_id",
                table: "custom_fields");

            migrationBuilder.DropColumn(
                name: "applies_to_unit_type_id",
                table: "custom_fields");

            migrationBuilder.DropColumn(
                name: "visible_to",
                table: "custom_fields");
        }
    }
}
