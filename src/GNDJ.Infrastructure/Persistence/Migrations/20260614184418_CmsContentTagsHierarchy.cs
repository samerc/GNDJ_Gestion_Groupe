using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CmsContentTagsHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "public_description",
                table: "units");

            migrationBuilder.AddColumn<string>(
                name: "public_description",
                table: "unit_types",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "parent_id",
                table: "pages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tag_type",
                table: "news_posts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "tag_unit_id",
                table: "news_posts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "tag_unit_type_id",
                table: "news_posts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_pages_parent_id",
                table: "pages",
                column: "parent_id");

            migrationBuilder.AddForeignKey(
                name: "fk_pages_pages_parent_id",
                table: "pages",
                column: "parent_id",
                principalTable: "pages",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_pages_pages_parent_id",
                table: "pages");

            migrationBuilder.DropIndex(
                name: "ix_pages_parent_id",
                table: "pages");

            migrationBuilder.DropColumn(
                name: "public_description",
                table: "unit_types");

            migrationBuilder.DropColumn(
                name: "parent_id",
                table: "pages");

            migrationBuilder.DropColumn(
                name: "tag_type",
                table: "news_posts");

            migrationBuilder.DropColumn(
                name: "tag_unit_id",
                table: "news_posts");

            migrationBuilder.DropColumn(
                name: "tag_unit_type_id",
                table: "news_posts");

            migrationBuilder.AddColumn<string>(
                name: "public_description",
                table: "units",
                type: "text",
                nullable: true);
        }
    }
}
