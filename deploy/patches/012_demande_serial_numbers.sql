-- 012_demande_serial_numbers.sql
-- Date: 2026-09-01
-- What: Backfill the new demande reference (serial_number = INS-YYYY-NNNN) for demandes that were already
--       SUBMITTED before the feature existed. Sequence is per scout year, ordered by submission date so the
--       numbering reflects the real submission order; new submissions continue from the max (the app's
--       generator reads max+1 per year).
-- Idempotent + non-destructive: only numbers rows whose serial_number is still NULL, and skips Drafts (an
-- unsubmitted draft never gets a number). Runs once via DataPatchRunner (after the AddDemandeSerialNumber
-- migration has added the column on startup).
-- NOTE: no BEGIN/COMMIT here — DataPatchRunner wraps each patch in its own transaction.

WITH ranked AS (
  SELECT id,
         'INS-' || split_part(scout_year, '-', 1) || '-' ||
         lpad(ROW_NUMBER() OVER (
           PARTITION BY scout_year
           ORDER BY submitted_at NULLS LAST, created_at, id
         )::text, 4, '0') AS serial
  FROM demandes
  WHERE status <> 'Draft' AND serial_number IS NULL AND is_deleted = false
)
UPDATE demandes d
SET serial_number = r.serial
FROM ranked r
WHERE d.id = r.id;
