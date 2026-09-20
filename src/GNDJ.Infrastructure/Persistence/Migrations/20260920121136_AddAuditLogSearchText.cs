using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLogSearchText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "search_text",
                table: "audit_logs",
                type: "text",
                nullable: true,
                computedColumnSql: "f_unaccent(lower(coalesce(ip_address,'') || ' ' || action || ' ' || entity_type || ' ' || coalesce(old_values::text,'') || ' ' || coalesce(new_values::text,'')))",
                stored: true);

            // GIN trigram index on the generated search haystack so the audit free-text search is index-assisted
            // (Bitmap Index Scan) instead of a full seq scan. pg_trgm/f_unaccent already exist (member-search
            // migration); guarded so this is safe on any DB. Not expressible via the fluent API (gin_trgm_ops).
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
            migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_audit_logs_search_trgm ON audit_logs USING gin (search_text gin_trgm_ops);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_audit_logs_search_trgm;");
            migrationBuilder.DropColumn(
                name: "search_text",
                table: "audit_logs");
        }
    }
}
