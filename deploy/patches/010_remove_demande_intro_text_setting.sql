-- 010_remove_demande_intro_text_setting.sql
-- Date: 2026-08-31
-- What: Delete the obsolete `demande.intro_text` setting row ("Texte d'accueil du portail").
-- Why:  The value was never rendered anywhere on the inscription portal — no page reads it. It only added a
--       confusing editable field in Settings -> Inscriptions that had no effect. Removed from the applicant
--       config DTO, BuildConfig, the seed and SeedMissingSettings so it won't be re-created.
-- Data only. Idempotent: a second run matches nothing.
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

DELETE FROM settings WHERE key = 'demande.intro_text';
