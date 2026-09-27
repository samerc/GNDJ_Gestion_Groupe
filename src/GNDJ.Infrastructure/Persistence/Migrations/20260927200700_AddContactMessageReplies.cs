using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContactMessageReplies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "contact_message_replies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    contact_message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    sent_to = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    replied_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    replied_by_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_contact_message_replies", x => x.id);
                    table.ForeignKey(
                        name: "fk_contact_message_replies_contact_messages_contact_message_id",
                        column: x => x.contact_message_id,
                        principalTable: "contact_messages",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_contact_message_replies_contact_message_id_created_at",
                table: "contact_message_replies",
                columns: new[] { "contact_message_id", "created_at" });

            // Keep the reply already stored on each message as the first entry of its history.
            migrationBuilder.Sql(@"
INSERT INTO contact_message_replies (id, contact_message_id, subject, body, sent_to, replied_by_user_id, replied_by_name, created_at)
SELECT gen_random_uuid(), m.id, COALESCE(m.reply_subject, ''), m.reply_body, m.sender_email, m.replied_by_user_id, NULL, m.replied_at
FROM contact_messages m
WHERE m.replied_at IS NOT NULL AND m.reply_body IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "contact_message_replies");
        }
    }
}
