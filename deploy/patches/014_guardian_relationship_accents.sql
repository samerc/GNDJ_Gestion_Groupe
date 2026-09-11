-- 014: Canonicalize migrated guardian-link relationships to the accented spellings the app uses everywhere.
-- The WEBDEV import wrote "Pere"/"Mere" (unaccented) on ~4859 links, while the app's relationship picker
-- (RELATIONSHIP_OPTIONS) and the demande-to-member conversion use "Père"/"Mère". The mismatch made the
-- guardian edit form's "Relation" <Select> render EMPTY for migrated parents (the display worked via a fuzzy
-- accent-insensitive label). Normalizing the stored values fixes the pre-fill AND makes migrated vs
-- demande-created guardians consistent. Idempotent (once accented, re-running matches nothing).
-- NO BEGIN/COMMIT (the DataPatchRunner owns the transaction).
UPDATE guardian_links SET relationship_type = 'Père' WHERE relationship_type = 'Pere';
UPDATE guardian_links SET relationship_type = 'Mère' WHERE relationship_type = 'Mere';
