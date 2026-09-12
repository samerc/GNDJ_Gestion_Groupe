using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReportTemplateScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Existing rows are single-unit rosters/exports → backfill scope=unit, filter=all, empty unit list.
            migrationBuilder.AddColumn<string>(
                name: "member_filter",
                table: "report_templates",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "all");

            migrationBuilder.AddColumn<string>(
                name: "scope_type",
                table: "report_templates",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "unit");

            migrationBuilder.AddColumn<string>(
                name: "scope_unit_ids_json",
                table: "report_templates",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<Guid>(
                name: "scope_unit_type_id",
                table: "report_templates",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "title_override",
                table: "report_templates",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "member_filter",
                table: "report_templates");

            migrationBuilder.DropColumn(
                name: "scope_type",
                table: "report_templates");

            migrationBuilder.DropColumn(
                name: "scope_unit_ids_json",
                table: "report_templates");

            migrationBuilder.DropColumn(
                name: "scope_unit_type_id",
                table: "report_templates");

            migrationBuilder.DropColumn(
                name: "title_override",
                table: "report_templates");
        }
    }
}
