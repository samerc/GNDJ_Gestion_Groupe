-- ============================================================================
-- EMERGENCY: turn OFF maintenance mode when you can't reach the UI.
--
-- Maintenance mode is just four boolean rows in the `settings` table. The server
-- caches them for ~15 seconds, so this takes effect within ~15s — NO app or IIS
-- restart needed. Run it on the PROD database (gndj), then wait ~15s and refresh.
--
--   psql -U gndj_admin -d gndj -f disable-maintenance.sql
--   -- or paste the UPDATE into the pgAdmin Query Tool (it auto-commits a single statement)
-- ============================================================================

UPDATE settings
SET value = 'false'
WHERE key IN ('maintenance.site', 'maintenance.membres', 'maintenance.demande', 'maintenance.public');

-- Verify (all four should read 'false'):
SELECT key, value FROM settings WHERE key LIKE 'maintenance.%' ORDER BY key;

-- NOTE: a super-admin is normally EXEMPT from maintenance (server bypass via the signed
-- is_super_admin token claim + the login/refresh endpoints stay open), so a fresh login
-- usually restores access without this script. Use this when that isn't possible.
