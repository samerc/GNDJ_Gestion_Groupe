using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRentreeTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rentree_task_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    phase = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    assignee_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    assignee_role = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    fan_out_per_unit = table.Column<bool>(type: "boolean", nullable: false),
                    assignee_member_ids = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    default_deadline_label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    depends_on_template_ids = table.Column<Guid[]>(type: "uuid[]", nullable: false),
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
                    table.PrimaryKey("pk_rentree_task_templates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "rentree_tasks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    scout_year = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    template_id = table.Column<Guid>(type: "uuid", nullable: true),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    phase = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    assignee_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    assignee_role = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assignee_member_ids = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    deadline_label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    due_date = table.Column<DateOnly>(type: "date", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    completed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    completed_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    depends_on_task_ids = table.Column<Guid[]>(type: "uuid[]", nullable: false),
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
                    table.PrimaryKey("pk_rentree_tasks", x => x.id);
                    table.ForeignKey(
                        name: "fk_rentree_tasks_units_unit_id",
                        column: x => x.unit_id,
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_rentree_tasks_scout_year",
                table: "rentree_tasks",
                column: "scout_year");

            migrationBuilder.CreateIndex(
                name: "ix_rentree_tasks_unit_id",
                table: "rentree_tasks",
                column: "unit_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rentree_task_templates");

            migrationBuilder.DropTable(
                name: "rentree_tasks");
        }
    }
}
