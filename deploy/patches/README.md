# Prod data patches

Numbered, **idempotent** SQL scripts for **data** changes that aren't carried by EF migrations or the seeders
(e.g. merging/renaming a role, fixing rows).

## How they run (automatic, exactly once)

On startup — right after EF migrations + seeders — `DataPatchRunner` (see
`src/GNDJ.Infrastructure/Persistence/DataPatchRunner.cs`, wired in `Program.cs`) applies every `*.sql` here that
hasn't run yet on that database, in filename order. It records each in a **`data_patches`** table, so a patch
runs **at most once per database** and is skipped on every later startup. Add a new `NNN_*.sql`, commit, deploy —
only the new file runs. (The `.sql` files are copied into the app output as `<app>/DataPatches` at publish time.)

So on prod you do **nothing** — the next deploy applies any new patches by itself. This still never copies dev
data to prod: only the committed, reviewed patch files run, against prod's own rows. Dev-only cleanup that we
*don't* want on prod simply never gets a patch file.

## Why this exists

`deploy\update.ps1 -Pull` ships only the **built app**. On prod startup it runs EF **schema migrations** and the
**idempotent seeders** — but both operate on **prod's own rows**; a code deploy never copies the dev database to
prod. So two categories of change reach prod automatically:

- **Schema** (new columns/tables) → EF migrations.
- **Policy/permissions & reference seed** → the startup seeders (e.g. `SeedMissingPermissionsAsync`,
  `SeedAssistantDeGroupeProfileAsync`). These self-heal every environment.
- **One-off data patches** → the `*.sql` files here, applied once each by `DataPatchRunner` (see below).

None of these copy the dev database to prod — they run *code* (or reviewed patch files) against prod's own rows.
So a one-off **data** edit only reaches prod if we deliberately add it as a patch file here; dev cleanup we don't
want on prod simply never gets a file. This keeps prod's (cleanest) member data untouched and gives an explicit,
reviewable trail of exactly what ran — instead of anything being implicit or a full dump/restore.

## Rules for a patch

1. **Idempotent** — safe to run more than once (guard with `IF ... RETURN`, `WHERE NOT EXISTS`, etc.). A second
   run must be a no-op, not an error.
2. **No `BEGIN`/`COMMIT`** — the runner wraps each patch (body + its `data_patches` row) in ONE transaction, so
   the patch commits atomically. Adding your own transaction control fights that and will misbehave. Also avoid
   statements that can't run inside a transaction (e.g. `CREATE INDEX CONCURRENTLY`, `VACUUM`) — patches are DML.
3. **Data only** — no schema DDL (that belongs in an EF migration) and **never** touches member/guardian personal
   data unless that is explicitly the patch's purpose and agreed.
4. **Documented** — header comment: date, what, why, and any dependency (e.g. "apply with / after the deploy that
   contains commit X").
5. **Numbered** — `NNN_short_description.sql`, sequential. Never renumber an applied patch.

## Manual run (fallback only)

Normally you don't run these — startup does. But if you ever need to apply one by hand (e.g. before a deploy),
on the prod server point psql at the prod DB and run with `ON_ERROR_STOP`, then record it so the app skips it:

```powershell
$env:PGPASSWORD = '<prod-db-password>'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
& $psql -U gndj_admin -d gndj -h localhost -v ON_ERROR_STOP=1 -f deploy\patches\001_achg_to_acg.sql
# mark it applied so the startup runner skips it:
& $psql -U gndj_admin -d gndj -h localhost -c "INSERT INTO data_patches(filename) VALUES ('001_achg_to_acg.sql') ON CONFLICT DO NOTHING;"
```

## What has run where

Applied patches are tracked automatically in each database's **`data_patches`** table — that's the source of
truth (no manual checklist to keep in sync). To see what a database has applied:

```sql
SELECT filename, applied_at FROM data_patches ORDER BY filename;
```

### Patch index

| Patch | Description |
|-------|-------------|
| 001_achg_to_acg.sql | Unify ACHG → ACG (merge archived ACG history, rename active role) |
