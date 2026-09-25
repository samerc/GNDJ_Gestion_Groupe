using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddScoutRelationSuggestedMember : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "suggested_member_id",
                table: "applicant_scout_relations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_applicant_scout_relations_suggested_member_id",
                table: "applicant_scout_relations",
                column: "suggested_member_id");

            migrationBuilder.AddForeignKey(
                name: "fk_applicant_scout_relations_members_suggested_member_id",
                table: "applicant_scout_relations",
                column: "suggested_member_id",
                principalTable: "members",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_applicant_scout_relations_members_suggested_member_id",
                table: "applicant_scout_relations");

            migrationBuilder.DropIndex(
                name: "ix_applicant_scout_relations_suggested_member_id",
                table: "applicant_scout_relations");

            migrationBuilder.DropColumn(
                name: "suggested_member_id",
                table: "applicant_scout_relations");
        }
    }
}
