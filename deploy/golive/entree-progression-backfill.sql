-- One-time entrée-progression backfill.
-- For every (member, unit) where the member holds a YOUTH (non-maîtrise) assignment, ensure that unit's
-- "Entrée à …" progression exists; insert it if missing (date = earliest real assignment start in that unit).
-- Groupe (GRP) is included BY FUNCTION: any member with a Groupe assignment gets "Entrée au Groupe" (maîtrise included).
-- Zero-day marker assignments (start_date = end_date) are excluded. Rows are attributed to the admin account and
-- carry notes = 'Entrée — ajout automatique' so the whole batch is reversible:
--     DELETE FROM member_progressions WHERE notes = 'Entrée — ajout automatique';
-- Idempotent: an entrée that already exists for a (member, unit) is skipped, so re-running is safe.
-- Run with:  psql -f entree-progression-backfill.sql   (reads UTF-8; do NOT paste accented literals via -c in git-bash)
--
-- Pre-step (cleanup, also needed on prod): remove migration-artifact progressions where a Ronde (girls) stage is
-- attached to a Troupe/Clan (boys) unit — boys are never in a Ronde.

\set ADMIN '019e8565-f667-73b4-8206-962efff277b3'
\set NOY_UT 'e6aede8e-3cd0-4089-9955-de717b40317b'

BEGIN;

-- 0) Backup once (skipped if it already exists).
CREATE TABLE IF NOT EXISTS _bak_progressions_20260827 AS TABLE member_progressions;

-- 1) Cleanup: soft-delete Ronde-stage progressions sitting on boys' (Troupe/Clan) units.
UPDATE member_progressions p
SET is_deleted = true, deleted_at = now(), deleted_by = :'ADMIN', updated_at = now()
FROM scout_stages s
JOIN unit_types ust ON ust.id = s.unit_type_id
WHERE p.scout_stage_id = s.id
  AND p.is_deleted = false
  AND ust.code = 'RON'
  AND p.unit_id IN (
    SELECT u.id FROM units u JOIN unit_types put ON put.id = u.unit_type_id WHERE put.code IN ('TRO', 'CLAN')
  );

-- 2) Create the missing "Entrée au Noyau" stage (Noyau had no stages). Idempotent.
INSERT INTO scout_stages
  (id, unit_type_id, code, name, description, display_order, is_active, is_badge_stage, created_at, updated_at, created_by, is_deleted)
SELECT gen_random_uuid(), :'NOY_UT', 'ENTREE-NOY', 'Entrée au Noyau', NULL, 0, true, false, now(), now(), :'ADMIN', false
WHERE NOT EXISTS (
  SELECT 1 FROM scout_stages WHERE unit_type_id = :'NOY_UT' AND name = 'Entrée au Noyau' AND is_deleted = false
);

-- 3) Backfill entrées for every branch.
--    es = the exact "Entrée à …" stage for each unit type (exact names dodge CLAN's extra 'Entrée Equipe Pilote' stage;
--    JEM matched with an ASCII-anchored ILIKE to avoid the apostrophe in "l'équipe").
INSERT INTO member_progressions
  (id, member_id, unit_id, scout_stage_id, badge_id, date, location, notes, created_at, updated_at, created_by, is_deleted)
SELECT gen_random_uuid(), t.member_id, t.unit_id, t.stage_id, NULL, t.entry_date, NULL,
       'Entrée — ajout automatique', now(), now(), :'ADMIN', false
FROM (
  SELECT a.member_id, a.unit_id, es.stage_id, MIN(a.start_date) AS entry_date
  FROM member_assignments a
  JOIN units u ON u.id = a.unit_id
  JOIN unit_types ut ON ut.id = u.unit_type_id
  JOIN functional_roles r ON r.id = a.functional_role_id
  JOIN (
    SELECT s.unit_type_id, s.id AS stage_id
    FROM scout_stages s
    JOIN unit_types ut2 ON ut2.id = s.unit_type_id
    WHERE s.is_deleted = false AND (
         (ut2.code = 'MEU'  AND s.name = 'Entrée à la Meute')     OR
         (ut2.code = 'RON'  AND s.name = 'Entrée à la Ronde')     OR
         (ut2.code = 'TRO'  AND s.name = 'Entrée à la Troupe')    OR
         (ut2.code = 'COM'  AND s.name = 'Entr. à la Compagnie')  OR
         (ut2.code = 'CLAN' AND s.name = 'Entrée au Clan')        OR
         (ut2.code = 'NOY'  AND s.name = 'Entrée au Noyau')       OR
         (ut2.code = 'JEM'  AND s.name ILIKE 'Entr%quipe JEM')    OR
         (ut2.code = 'FEU'  AND s.name = 'Entrée au Feu')         OR
         (ut2.code = 'GRP'  AND s.name = 'Entrée au Groupe')
    )
  ) es ON es.unit_type_id = ut.id
  WHERE a.is_deleted = false
    AND (a.end_date IS NULL OR a.start_date <> a.end_date)   -- exclude zero-day markers
    AND (r.is_maitrise = false OR ut.code = 'GRP')           -- youth branches: non-maîtrise; Groupe: any function
  GROUP BY a.member_id, a.unit_id, es.stage_id
) t
WHERE NOT EXISTS (
  SELECT 1 FROM member_progressions p
  WHERE p.member_id = t.member_id AND p.unit_id = t.unit_id
    AND p.scout_stage_id = t.stage_id AND p.is_deleted = false
);

-- Report
SELECT count(*) AS total_auto_entrees FROM member_progressions WHERE notes = 'Entrée — ajout automatique' AND is_deleted = false;

COMMIT;
