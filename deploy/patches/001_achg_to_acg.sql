-- 001_achg_to_acg.sql
-- Date: 2026-07-13
-- What: Unify the group "Assistant Chef de Groupe" role under a single code ACG.
--       The active role was coded ACHG; the pre-consolidation ACG still existed as an ARCHIVED role holding
--       only historical assignments. This moves that history onto the active role, deletes the empty archived
--       ACG, and renames the active role's code ACHG -> ACG.
-- Why:  ACHG and ACG were the same tier (both "Assistant Chef de Groupe"); we want one clean "ACG".
-- Data only. Role id is unchanged, so all member_assignments / passages FKs stay intact.
-- Dependency: none. NOTE the seed (SeedData.ScoutStructure) still defines the group role as ACHG for FRESH
--       databases — that alignment is a separate, pending code change. This patch only fixes an EXISTING db.
-- Idempotent: a second run finds no active ACHG and is a no-op.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

DO $$
DECLARE grp uuid; old_acg uuid; achg uuid; moved int;
BEGIN
    SELECT id INTO grp FROM unit_types WHERE code = 'GRP';
    IF grp IS NULL THEN
        RAISE NOTICE 'No GRP unit type found — nothing to do.';
        RETURN;
    END IF;

    -- The active role still coded ACHG. If it's gone, this patch already ran (or never applied) -> no-op.
    SELECT id INTO achg FROM functional_roles
        WHERE code = 'ACHG' AND unit_type_id = grp AND is_deleted = false;
    IF achg IS NULL THEN
        RAISE NOTICE 'No active ACHG role — already unified. Nothing to do.';
        RETURN;
    END IF;

    -- The old archived ACG (may or may not exist). Move its references onto the active role, then delete it.
    SELECT id INTO old_acg FROM functional_roles
        WHERE code = 'ACG' AND unit_type_id = grp AND is_deleted = false;
    IF old_acg IS NOT NULL THEN
        UPDATE member_assignments SET functional_role_id = achg WHERE functional_role_id = old_acg;
        GET DIAGNOSTICS moved = ROW_COUNT;
        RAISE NOTICE 'Assignments moved from old ACG to active role: %', moved;

        UPDATE passages SET current_role_id  = achg WHERE current_role_id  = old_acg;
        UPDATE passages SET proposed_role_id = achg WHERE proposed_role_id = old_acg;
        UPDATE passages SET final_role_id    = achg WHERE final_role_id    = old_acg;

        DELETE FROM functional_roles WHERE id = old_acg;   -- now unreferenced
        RAISE NOTICE 'Deleted empty archived ACG role.';
    END IF;

    -- The active role takes over the ACG code (name is kept: "Assistant Chef(taine) de Groupe").
    UPDATE functional_roles SET code = 'ACG' WHERE id = achg;
    RAISE NOTICE 'Renamed active role ACHG -> ACG.';
END $$;
