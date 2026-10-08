using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDemandeMemberMatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "member_match_id",
                table: "demandes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "member_match_status",
                table: "demandes",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_demandes_member_match_id",
                table: "demandes",
                column: "member_match_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_demandes_member_match_id",
                table: "demandes");

            migrationBuilder.DropColumn(
                name: "member_match_id",
                table: "demandes");

            migrationBuilder.DropColumn(
                name: "member_match_status",
                table: "demandes");
        }
    }
}
