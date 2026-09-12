-- 016: Alias "Notre Dame de Jamhour" -> code CNDJ in the school-code map (member.school_codes).
-- The demande "Par école" stats showed "CNDJ" twice: the canonical "Collège Notre-Dame de Jamhour" is mapped
-- to CNDJ, but a few demandes stored variant spellings. Punctuation/spacing variants ("College Notre Dame de
-- Jamhour") are now handled by the improved normalizeSchool (they resolve to the mapped canonical), but
-- "Notre Dame de Jamhour" — MISSING the word "Collège" — normalizes to a different key, so it fell back to an
-- auto acronym ("NDJ") and stayed a separate row. It's the same school, so map it explicitly to CNDJ. The
-- lookup normalizes accents/case/punctuation, so this one key also covers "Notre dame de jamhour",
-- "Notre-Dame de Jamhour", etc. Merge the key into the existing JSON object without disturbing other entries.
-- Idempotent (skips if the key already exists). NO BEGIN/COMMIT (the DataPatchRunner owns the transaction).
UPDATE settings
SET value = (value::jsonb || '{"Notre Dame de Jamhour":"CNDJ"}'::jsonb)::text
WHERE key = 'member.school_codes'
  AND NOT (value::jsonb ? 'Notre Dame de Jamhour');
