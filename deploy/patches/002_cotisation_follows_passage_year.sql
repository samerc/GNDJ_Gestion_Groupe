-- 002_cotisation_follows_passage_year.sql
-- Date: 2026-07-29
-- What: The app's "année scoute en cours" now follows passage.scout_year (the year the CG opens) instead of a
--       separate cotisation.current_scout_year setting. This drops the now-redundant cotisation setting and
--       clarifies the passage one's label/description (it also drives cotisations, dashboards, trombinoscope,
--       lists and exports).
-- Why:  One source of truth for the active scout year — the cotisation year could drift out of sync.
-- Data only. All consumers (frontend + GetMembersQuery) already read passage.scout_year in the code change
--       shipped with this patch.
-- Idempotent: UPDATE/DELETE are naturally idempotent; a second run changes nothing.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

UPDATE settings
SET label = 'Année scoute en cours',
    description = 'Année scoute active, ouverte par le CG pour le passage. Sert aussi de référence aux cotisations, tableaux de bord, trombinoscope, listes et exports.'
WHERE key = 'passage.scout_year';

-- Delete both the current key and its pre-rename form, so this is safe regardless of seeder/patch order.
DELETE FROM settings WHERE key IN ('cotisation.current_scout_year', 'cotisation.current_school_year');
