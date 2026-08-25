-- =============================================================================
-- ONE-SHOT prod fix: move Naia (F-0629) to C2 as an alumna + retire the
-- "(Non affectés)" placeholder units. Runs as a single transaction and ENDS
-- WITH COMMIT — run the whole thing at once (no separate commit step).
-- Safe: backs everything up first (_bak_* tables survive for recovery).
-- =============================================================================
BEGIN;

-- ── A) Naia → C2 ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS _bak_naia_assign;
CREATE TABLE _bak_naia_assign AS
  SELECT * FROM member_assignments
   WHERE member_id = (SELECT id FROM members WHERE card_number = 'F-0629');

-- repoint her Compagnie-placeholder rows to the REAL C2 (unit code 'C2'); clear
-- the placeholder team. (If C2 isn't found this errors out loudly — good.)
UPDATE member_assignments
   SET unit_id = (SELECT id FROM units WHERE code = 'C2'),
       team_id = NULL, updated_at = now()
 WHERE member_id = (SELECT id FROM members WHERE card_number = 'F-0629')
   AND unit_id IN (SELECT id FROM units WHERE name ILIKE '%non affect%');

-- close her still-open row → C2 alumna (she left the group)
UPDATE member_assignments
   SET end_date = CURRENT_DATE, updated_at = now()
 WHERE member_id = (SELECT id FROM members WHERE card_number = 'F-0629')
   AND end_date IS NULL;

-- ── B) Retire the placeholder units ─────────────────────────────────────────
CREATE TEMP TABLE _ph AS SELECT id FROM units WHERE name ILIKE '%non affect%';

DROP TABLE IF EXISTS _bak_retire_ph_units;
DROP TABLE IF EXISTS _bak_retire_ph_teams;
DROP TABLE IF EXISTS _bak_retire_ph_assign;
CREATE TABLE _bak_retire_ph_units  AS SELECT * FROM units              WHERE id      IN (SELECT id FROM _ph);
CREATE TABLE _bak_retire_ph_teams  AS SELECT * FROM teams              WHERE unit_id IN (SELECT id FROM _ph);
CREATE TABLE _bak_retire_ph_assign AS SELECT * FROM member_assignments WHERE unit_id IN (SELECT id FROM _ph);

-- close any assignment still active on a placeholder (should be none after A)
UPDATE member_assignments
   SET end_date = CURRENT_DATE, updated_at = now()
 WHERE unit_id IN (SELECT id FROM _ph) AND end_date IS NULL AND is_deleted = false;

-- clear the 3 NON-FK unit references so nothing dangles
UPDATE events            SET tag_unit_id = NULL WHERE tag_unit_id IN (SELECT id FROM _ph);
UPDATE news_posts        SET tag_unit_id = NULL WHERE tag_unit_id IN (SELECT id FROM _ph);
UPDATE camp_participants SET unit_id     = NULL WHERE unit_id     IN (SELECT id FROM _ph);

-- deactivate ALL placeholders
UPDATE units SET is_active = false, updated_at = now() WHERE id IN (SELECT id FROM _ph);

-- hard-delete only the FULLY EMPTY ones (Meute/Ronde); Compagnie/Troupe keep
-- history → stay deactivated. CASCADE (meetings/trombi) + SET NULL (rentree) auto-handle.
DELETE FROM units u
 WHERE u.id IN (SELECT id FROM _ph)
   AND NOT EXISTS (SELECT 1 FROM teams x               WHERE x.unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM member_assignments x  WHERE x.unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM member_progressions x WHERE x.unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM passages x            WHERE u.id IN (x.current_unit_id, x.proposed_unit_id, x.final_unit_id))
   AND NOT EXISTS (SELECT 1 FROM demandes x            WHERE x.decided_unit_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM unit_intake_quotas x  WHERE x.unit_id = u.id);

COMMIT;

-- ── Verify (after commit) ────────────────────────────────────────────────────
-- Naia should now show her Compagnie rows on "Compagnie 2 Jamhour", latest end-dated:
SELECT u.name AS unit, fr.name AS role, a.start_date, a.end_date
FROM member_assignments a
JOIN units u ON u.id = a.unit_id
LEFT JOIN functional_roles fr ON fr.id = a.functional_role_id
WHERE a.member_id = (SELECT id FROM members WHERE card_number = 'F-0629')
ORDER BY a.start_date;

-- Remaining placeholders should be only Compagnie + Troupe, both is_active=false:
SELECT name, is_active FROM units WHERE name ILIKE '%non affect%' ORDER BY name;
