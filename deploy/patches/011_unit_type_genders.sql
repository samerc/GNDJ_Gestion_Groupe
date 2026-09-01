-- 011_unit_type_genders.sql
-- Date: 2026-09-01
-- What: Set the `gender` on each unit type (branch). This drives which units a boy/girl demande is
--       eligible for and which unit is SUGGESTED in the CG review — previously blank for every branch,
--       so the gender filter was skipped and a girl could be suggested a Troupe (boys), etc.
-- Mapping (confirmed with the CG): Garçons = Meute/Troupe/Clan · Filles = Ronde/Compagnie/Caravelles/
--       Pionnières/Feu/Noyau/Jeunes en Marche · Mixte = Groupe.
-- Idempotent + non-destructive: only sets a branch whose gender is still NULL, so a later manual change
-- in the admin UI (Types d'unité → Informations → Genre) is never overwritten.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

UPDATE unit_types SET gender = 'Masculin' WHERE code IN ('MEU','TRO','CLAN') AND gender IS NULL;
UPDATE unit_types SET gender = 'Féminin'  WHERE code IN ('RON','COM','CAR','PIO','FEU','NOY','JEM') AND gender IS NULL;
UPDATE unit_types SET gender = 'Mixte'    WHERE code IN ('GRP') AND gender IS NULL;
