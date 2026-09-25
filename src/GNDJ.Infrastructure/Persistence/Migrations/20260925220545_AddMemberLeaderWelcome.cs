using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberLeaderWelcome : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "leader_welcome_sent_at",
                table: "members",
                type: "timestamp with time zone",
                nullable: true);

            // Everyone who holds or ever held a leadership (maîtrise) role counts as already welcomed, so the
            // automatic "Bienvenue dans la maîtrise" email only goes to chefs named AFTER this deploy.
            migrationBuilder.Sql(@"
                UPDATE members m SET leader_welcome_sent_at = now()
                WHERE m.leader_welcome_sent_at IS NULL
                  AND EXISTS (SELECT 1 FROM member_assignments a
                              JOIN functional_roles r ON r.id = a.functional_role_id
                              WHERE a.member_id = m.id AND r.is_maitrise);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "leader_welcome_sent_at",
                table: "members");
        }
    }
}
