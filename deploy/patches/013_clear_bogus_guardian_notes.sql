-- 013: Clear the bogus "Parents separes/divorces" note that the WEBDEV import stamped onto ~94% of guardians.
-- It is a single blanket default (3040 identical rows, 0 other distinct notes on dev/prod), NOT a real per-family
-- fact, so it wrongly labels intact families as separated/divorced. Match is accent-free on the ascii core
-- "divorc" (the only guardian note containing it) so the patch runner never has to deal with encoded characters.
-- Idempotent: once cleared, re-running matches nothing. NO BEGIN/COMMIT (the DataPatchRunner owns the txn).
UPDATE guardians SET notes = NULL
WHERE notes IS NOT NULL AND notes ILIKE '%divorc%';
