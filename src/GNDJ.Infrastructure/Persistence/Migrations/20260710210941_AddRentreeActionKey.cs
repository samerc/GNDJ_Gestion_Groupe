using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRentreeActionKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "action_key",
                table: "rentree_tasks",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "action_key",
                table: "rentree_task_templates",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "action_key",
                table: "rentree_tasks");

            migrationBuilder.DropColumn(
                name: "action_key",
                table: "rentree_task_templates");
        }
    }
}
