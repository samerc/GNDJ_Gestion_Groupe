-- =============================================================================
-- retire-placeholder-units.sql   (MANUAL — not auto-run by DataPatchRunner)
-- -----------------------------------------------------------------------------
-- Retires the "(Non affectés)" migration placeholder units (Meute / Ronde /
-- Troupe / Compagnie "(Non affectés)"). These are transit units the WEBDEV
-- import used for members with no real unit; they should not appear in unit
-- pickers, the dashboard, the public site or the rentrée fan-out.
--
-- STRATEGY (safe, reversible):
--   • Back up the 4 units + their teams + their assignments first.
--   • CLOSE (not delete) any ACTIVE assignment on a placeholder → the member
--     becomes an alumnus as of today (a placeholder is never a real placement).
--   • Clear the 3 NON-FK unit references (events.tag_unit_id, news_posts.
--     tag_unit_id, camp_participants.unit_id) so nothing dangles after a delete.
--   • DEACTIVATE all 4 (is_active=false) — removes them everywhere without the
--     RESTRICT errors and without losing historical assignments/passages.
--   • HARD-DELETE only the FULLY EMPTY ones (no teams / assignments / etc.).
--     This auto-selects Meute + Ronde and safely skips Compagnie + Troupe
--     (which still hold history and would be blocked by RESTRICT anyway).
--
-- FK delete-rules to units (verified 2026-08-25):
--   RESTRICT : teams, member_assignments, member_progressions, passages
--              (current/proposed/final_unit_id), demandes.decided_unit_id,
--              unit_intake_quotas  → a DELETE is blocked while any row exists.
--   CASCADE  : meetings, trombinoscope_archives  → auto-deleted with the unit.
--   SET NULL : rentree_tasks.unit_id             → those tasks' unit_id → NULL.
--   NON-FK   : events.tag_unit_id, news_posts.tag_unit_id, camp_participants.
--              unit_id  → NOT blocked by a delete; cleared explicitly below.
--
-- HOW TO RUN:
--   1. Run PART 1 (read-only) and CONFIRM the counts + the active members that
--      PART 2 will close. If an "active" member should NOT be closed (they are
--      really in the group), move them to their real unit BEFORE running PART 2.
--   2. Run PART 2. Review the final report SELECTs, then COMMIT (or ROLLBACK).
--
-- RECOVERY: everything removed is in _bak_retire_ph_units / _teams / _assign.
-- NOTE: not testable on dev (dev has no placeholders — deleted 2026-08-24);
-- this is for the environment that still has them (prod / a fresh import restore).
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — DRY RUN (read-only). Review before PART 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a) Every reference to each placeholder (incl. the 3 non-FK columns).
WITH t AS (SELECT id, name, is_active FROM units WHERE name ILIKE '%non affect%')
SELECT t.name, t.is_active,
  (SELECT count(*) FROM teams x               WHERE x.unit_id = t.id) AS teams,
  (SELECT count(*) FROM member_assignments x  WHERE x.unit_id = t.id) AS assign_all,
  (SELECT count(*) FROM member_assignments x  WHERE x.unit_id = t.id AND x.end_date IS NULL AND x.is_deleted = false) AS assign_active,
  (SELECT count(*) FROM member_progressions x WHERE x.unit_id = t.id) AS progressions,
  (SELECT count(*) FROM passages x            WHERE t.id IN (x.current_unit_id, x.proposed_unit_id, x.final_unit_id)) AS passages,
  (SELECT count(*) FROM meetings x            WHERE x.unit_id = t.id) AS meetings,
  (SELECT count(*) FROM rentree_tasks x       WHERE x.unit_id = t.id) AS rentree,
  (SELECT count(*) FROM demandes x            WHERE x.decided_unit_id = t.id) AS demandes,
  (SELECT count(*) FROM trombinoscope_archives x WHERE x.unit_id = t.id) AS trombi,
  (SELECT count(*) FROM unit_intake_quotas x  WHERE x.unit_id = t.id) AS quotas,
  (SELECT count(*) FROM events x              WHERE x.tag_unit_id = t.id) AS events,
  (SELECT count(*) FROM news_posts x          WHERE x.tag_unit_id = t.id) AS news,
  (SELECT count(*) FROM camp_participants x   WHERE x.unit_id = t.id) AS camp
FROM t ORDER BY t.name;

-- 1b) The ACTIVE members PART 2 will CLOSE (make alumni as of today).
--     CONFIRM each of these has really left / belongs elsewhere.
SELECT u.name AS unit, m.card_number, m.first_name, m.last_name, fr.name AS role, a.start_date
FROM member_assignments a
JOIN units u ON u.id = a.unit_id
JOIN members m ON m.id = a.member_id
LEFT JOIN functional_roles fr ON fr.id = a.functional_role_id
WHERE u.name ILIKE '%non affect%' AND a.end_date IS NULL AND a.is_deleted = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — CLEANUP (transactional). Review the reports, then COMMIT / ROLLBACK.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- Placeholders to operate on.
CREATE TEMP TABLE _ph AS SELECT id FROM units WHERE name ILIKE '%non affect%';

-- Backups (drop+recreate so re-running is clean; survive COMMIT for recovery).
DROP TABLE IF EXISTS _bak_retire_ph_units;
DROP TABLE IF EXISTS _bak_retire_ph_teams;
DROP TABLE IF EXISTS _bak_retire_ph_assign;
CREATE TABLE _bak_retire_ph_units  AS SELECT * FROM units              WHERE id      IN (SELECT id FROM _ph);
CREATE TABLE _bak_retire_ph_teams  AS SELECT * FROM teams              WHERE unit_id IN (SELECT id FROM _ph);
CREATE TABLE _bak_retire_ph_assign AS SELECT * FROM member_assignments WHERE unit_id IN (SELECT id FROM _ph);

-- 1) Close any ACTIVE assignment on a placeholder → historical (row kept, end-dated).
UPDATE member_assignments
   SET end_date = CURRENT_DATE, updated_at = now()
 WHERE unit_id IN (SELECT id FROM _ph) AND end_date IS NULL AND is_deleted = false;

-- 2) Clear the 3 NON-FK unit references so nothing dangles after a hard delete.
UPDATE events            SET tag_unit_id = NULL WHERE tag_unit_id IN (SELECT id FROM _ph);
UPDATE news_posts        SET tag_unit_id = NULL WHERE tag_unit_id IN (SELECT id FROM _ph);
UPDATE camp_participants SET unit_id     = NULL WHERE unit_id     IN (SELECT id FROM _ph);

-- 3) Deactivate ALL placeholders (safe baseline — out of pickers/dashboard/fan-out).
UPDATE units SET is_active = false, updated_at = now() WHERE id IN (SELECT id FROM _ph);

-- 4) HARD-DELETE only the FULLY EMPTY placeholders (0 teams / assignments / etc.).
--    CASCADE (meetings, trombinoscope_archives) + SET NULL (rentree_tasks) auto-handle.
--    Compagnie/Troupe keep history → skipped here (they stay deactivated).
DELETE FROM units u
 WHERE u.id IN (SELECT id FROM _ph)
   AND NOT EXISTS (SELECT 1 FROM teams x              WHERE x.unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM member_assignments x WHERE x.unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM member_progressions x WHERE x.unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM passages x           WHERE u.id IN (x.current_unit_id, x.proposed_unit_id, x.final_unit_id))
   AND NOT EXISTS (SELECT 1 FROM demandes x           WHERE x.decided_unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM unit_intake_quotas x WHERE x.unit_id = u.id);

-- 5) Final report — what remains (deactivated) vs. what was deleted.
SELECT name AS remaining_placeholder, is_active FROM units WHERE name ILIKE '%non affect%' ORDER BY name;
--    (Rows here = deactivated + kept. Rows GONE vs. PART 1 = hard-deleted.)

-- Review the two reports above, then:
--    COMMIT;      -- apply
--    ROLLBACK;    -- undo everything in this transaction

-- After COMMIT (optional): regenerate the year's rentrée so the deactivated units
-- drop out of the per-unit fan-out — POST /rentree/generate { scoutYear, overwrite:true }.
