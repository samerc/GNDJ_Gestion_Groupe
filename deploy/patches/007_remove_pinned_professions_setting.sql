-- 007_remove_pinned_professions_setting.sql
-- Date: 2026-08-19
-- What: Delete the obsolete `pinned_professions` setting row ("Professions épinglées").
-- Why:  It only pinned 5 favourites to the top of the parent-profession picker, whose options come from a
--       hardcoded constant (not a managed list). It was confusingly redundant next to the managed "Professions"
--       (profession domains) list, and is no longer read anywhere (the guardian form dropped pinnedValues).
-- Data only. Removed from seed + SeedMissingSettings so it won't be re-created.
-- Idempotent: a second run matches nothing.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

DELETE FROM settings WHERE key = 'pinned_professions';
