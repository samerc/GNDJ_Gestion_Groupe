-- 009 — Entrée-progression backfill (one-time, auto-applied once by DataPatchRunner).
--
-- Gives every member the missing "Entrée à …" progression for each unit they passed through.
-- Rule: for every (member, unit) with a YOUTH (non-maîtrise) assignment, insert that unit's entrée if missing;
-- Groupe (GRP) is included BY FUNCTION (any GRP assignment, maîtrise incl.). date = earliest real assignment
-- start in that unit; zero-day markers (start_date = end_date) excluded; note 'Entrée — ajout automatique';
-- attributed to the admin account; skipped if that exact entrée already exists.
--
-- Also a one-time cleanup (migration artifact): remove Ronde (girls) stage progressions attached to Troupe/Clan
-- (boys) units — boys are never in a Ronde.
--
-- IDEMPOTENT + portable: no hardcoded per-DB GUIDs (admin resolved by email, unit types by code), NOT EXISTS
-- guards everywhere, so a second run is a no-op. NO BEGIN/COMMIT and NO psql meta-commands (the runner owns the
-- transaction and executes the whole file as one ADO.NET batch). Reversible:
--     DELETE FROM member_progressions WHERE notes = 'Entrée — ajout automatique';
-- (and un-delete the Ronde cleanup via _bak_progressions_entree_backfill if ever needed).

-- 0) One-time backup of the whole progressions table before the cleanup + backfill.
CREATE TABLE IF NOT EXISTS _bak_progressions_entree_backfill AS TABLE member_progressions;

-- 1) Cleanup: soft-delete Ronde-stage progressions sitting on boys' (Troupe/Clan) units.
UPDATE member_progressions p
SET is_deleted = true,
    deleted_at = now(),
    deleted_by = (SELECT id FROM users WHERE email = 'admin@gndj.local' AND is_deleted = false LIMIT 1),
    updated_at = now()
FROM scout_stages s
JOIN unit_types ust ON ust.id = s.unit_type_id
WHERE p.scout_stage_id = s.id
  AND p.is_deleted = false
  AND ust.code = 'RON'
  AND p.unit_id IN (
    SELECT u.id FROM units u JOIN unit_types put ON put.id = u.unit_type_id WHERE put.code IN ('TRO', 'CLAN')
  );

-- 2) Create the missing "Entrée au Noyau" stage (Noyau had no stages). Resolves the NOY unit type by code.
INSERT INTO scout_stages
  (id, unit_type_id, code, name, description, display_order, is_active, is_badge_stage, created_at, updated_at, created_by, is_deleted)
SELECT gen_random_uuid(), ut.id, 'ENTREE-NOY', 'Entrée au Noyau', NULL, 0, true, false, now(), now(),
       (SELECT id FROM users WHERE email = 'admin@gndj.local' AND is_deleted = false LIMIT 1), false
FROM unit_types ut
WHERE ut.code = 'NOY' AND ut.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM scout_stages s WHERE s.unit_type_id = ut.id AND s.name = 'Entrée au Noyau' AND s.is_deleted = false
  );

-- 3) Backfill entrées for every branch. es = the exact "Entrée à …" stage per unit type (exact names dodge
--    CLAN's extra 'Entrée Equipe Pilote' stage; JEM matched via ASCII-anchored ILIKE to avoid the apostrophe
--    in "l'équipe").
INSERT INTO member_progressions
  (id, member_id, unit_id, scout_stage_id, badge_id, date, location, notes, created_at, updated_at, created_by, is_deleted)
SELECT gen_random_uuid(), t.member_id, t.unit_id, t.stage_id, NULL, t.entry_date, NULL,
       'Entrée — ajout automatique', now(), now(),
       (SELECT id FROM users WHERE email = 'admin@gndj.local' AND is_deleted = false LIMIT 1), false
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
