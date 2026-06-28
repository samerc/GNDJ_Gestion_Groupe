using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GNDJ.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberSearchTrgmIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Member search (GetMembersQuery) does unaccent(lower(name)) LIKE '%term%'. A plain btree can't
            // serve a leading-wildcard LIKE over a function expression, so every keystroke seq-scanned ~2.4k
            // members. Fix: a pg_trgm GIN index on the SAME expression the query uses.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

            // unaccent(text) is only STABLE, and Postgres refuses to index a non-IMMUTABLE expression.
            // f_unaccent wraps the 2-arg unaccent(dictionary, text) form, which IS safe to mark IMMUTABLE.
            // The EF DbFunction (GndjDbContext) is mapped to f_unaccent so the query expression matches.
            migrationBuilder.Sql(@"
                CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
                LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
                $$ SELECT public.unaccent('public.unaccent', $1) $$;");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS ix_members_firstname_trgm ON members
                USING gin (f_unaccent(lower(first_name)) gin_trgm_ops);");
            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS ix_members_lastname_trgm ON members
                USING gin (f_unaccent(lower(last_name)) gin_trgm_ops);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_members_firstname_trgm;");
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_members_lastname_trgm;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS f_unaccent(text);");
            // pg_trgm extension left in place (harmless, may be used by other indexes).
        }
    }
}
