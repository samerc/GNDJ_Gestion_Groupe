-- 017: Normalize the CNDJ (Collège Notre-Dame de Jamhour) school spelling variants to the canonical name.
-- A handful of 2026-2027 demandes were saved with variant spellings ("College Notre Dame de Jamhour",
-- "Notre Dame de Jamhour", "Collège Notre Dame de Jamhour", etc.) because a parent used the "Autre…" free-text
-- option instead of picking the school from the list, and the old matcher only folded accents/case (not the
-- hyphen/spacing). Snap them to the canonical "Collège Notre-Dame de Jamhour" so the source data — not just the
-- stats display — is deduped. Matches by a punctuation/accent/case-insensitive normalized key, so it covers every
-- variant (collegenotredamedejamhour + notredamedejamhour, the latter missing the word "Collège"). Excludes rows
-- already canonical. The members clause is a no-op on current data (members are clean) but future-proofs prod.
-- Idempotent (once canonical, the "<> canonical" guard skips them). NO BEGIN/COMMIT (the runner owns the txn).
UPDATE demandes
SET school = 'Collège Notre-Dame de Jamhour'
WHERE is_deleted = false
  AND school IS NOT NULL
  AND school <> 'Collège Notre-Dame de Jamhour'
  AND lower(regexp_replace(unaccent(school), '[^a-zA-Z0-9]', '', 'g'))
      IN ('collegenotredamedejamhour', 'notredamedejamhour');

UPDATE members
SET school = 'Collège Notre-Dame de Jamhour'
WHERE is_deleted = false
  AND school IS NOT NULL
  AND school <> 'Collège Notre-Dame de Jamhour'
  AND lower(regexp_replace(unaccent(school), '[^a-zA-Z0-9]', '', 'g'))
      IN ('collegenotredamedejamhour', 'notredamedejamhour');
